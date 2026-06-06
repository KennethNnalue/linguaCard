# Feature Document: Story Studio — AI-Powered Contextual Reading
## LC-043 · Epic 2 — Immersive Reading & Listening

---

## Research Foundation

### Why AI-generated stories work

**CHI 2024 study (n=272):** A peer-reviewed study at the ACM Conference on Human Factors in Computing Systems found that AI-generated personalised short stories incorporating the learner's own vocabulary produced measurably higher learning motivation than generic example sentences. The "Gen-Story" condition outperformed both a control group (pre-existing example sentences) and a "Gen-Sentence" condition. Personalisation plus narrative is the key combination.

**ScienceDirect 2024:** AI-generated storytelling groups showed superior long-term vocabulary retention compared to gamified or traditional methods, with learners attributing their higher motivation to "immersive and meaningful narratives."

**Krashen's i+1 Comprehensible Input Hypothesis:** Second language acquisition research establishes that learners acquire language fastest when they understand approximately 90–98% of the input, with only a small number of new or unfamiliar items present. Stories generated from the learner's *own vocabulary* are almost uniquely well-positioned to hit this ratio — the learner already knows most of the words because they added them. The story provides the grammatical context and connective tissue.

### How the karaoke highlighting works (technical)

OpenAI's TTS (`tts-1`, `gpt-4o-mini-tts`) does not natively return word-level timestamps. The standard production workaround is:

1. Generate audio using OpenAI TTS → save as MP3/AAC
2. Pass the same audio through OpenAI Whisper with `response_format: "verbose_json"` and `timestamp_granularities: ["word"]` → receive word-level timestamps
3. Store the timestamp array alongside the audio URL in the database
4. On the client, use `HTMLAudioElement.currentTime` polled at 100ms intervals to look up which word is currently being spoken and apply the `.active` highlight class

Apple's native TTS (`AVSpeechSynthesizer` on iOS via Capacitor) supports real-time word boundaries via `willSpeakRangeOfSpeechString` delegate — this provides the best experience on iOS with zero API cost.

---

## Feature Overview

Story Studio is a new top-level section of LinguaCard, accessible via the bottom navigation bar (replaces the "Listen" tab). It generates and saves personalised German stories built entirely from the words in the user's vocabulary collections.

### Core learning loop

```
User picks a collection (or combination)
         ↓
AI generates a story using those exact words in natural everyday context
(Krashen i+1 level: 90%+ known words + new grammatical patterns)
         ↓
User reads/listens with karaoke highlighting
Vocabulary words are colour-coded and tappable for instant definition
         ↓
Post-story: list of vocabulary words encountered in the story
User can launch a targeted review session of those words
         ↓
Story and word list saved to their library
         ↓
Repeat — new stories can be generated from same collection or combined collections
```

---

## Screens

Open `design-reference.html` and scroll to screens 12 → 12d:

| Screen | What it shows |
|---|---|
| **12 · Story Studio library** | Top-level screen with "Generate" CTA hero, saved story cards showing title / word chips / reading time / difficulty level |
| **12a · Generate story sheet** | Bottom sheet: collection multi-picker, length (Short / Medium / Long), difficulty (A2 / B1 / B2), Generate button |
| **12b · Story reader (listening)** | Full reading player: German text with karaoke word highlights, word popup tooltip, audio controls (play/pause, ±10s, speed 0.5×–2×), progress bar |
| **12c · Story reader (translation)** | Same player with bilingual sentence-pair view toggled; each pair shows German above / English below; vocabulary words bold in both |
| **12d · Post-story vocab check** | Completion screen: emoji banner, list of vocabulary words encountered in the story with article colours and mastery dots, "Review these N words" CTA |

---

## Part 1 — Backend: NestJS

### 1.1 — Database entities

```typescript
// src/story/entities/story.entity.ts
@Entity('stories')
export class Story {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column() title: string;             // German title, AI-generated
  @Column() titleTranslation: string;  // English translation

  @Column('text') bodyDe: string;      // Full German story text
  @Column('text') bodyEn: string;      // Full English translation

  @Column({ type: 'json' })
  sentences: StorySentence[];          // Array of sentence pairs for translation view

  @Column({ type: 'json' })
  wordTimestamps: WordTimestamp[];     // [{word, startMs, endMs}] from Whisper

  @Column({ type: 'json' })
  vocabWords: StoryVocabWord[];        // words from user's vault that appear in the story

  @Column({ nullable: true })
  audioUrl: string;                    // S3/storage URL for the MP3

  @Column({ nullable: true })
  audioDurationMs: number;

  @Column({ type: 'json' })
  sourceCollectionIds: string[];       // which collections were used

  @Column()
  difficultyLevel: 'A2' | 'B1' | 'B2';

  @Column()
  lengthType: 'short' | 'medium' | 'long';

  @Column({ default: 0 })
  listenCount: number;                 // times this story has been listened to

  @Column({ nullable: true })
  lastListenedAt: string;

  @Column()
  generatedAt: string;

  @Index() @Column()
  @ManyToOne(() => User)
  @Column({ type: 'uuid' })
  userId: string;
}

export interface StorySentence {
  index: number;
  german: string;
  english: string;
  vocabWordIds: string[];  // which vocab words appear in this sentence
}

export interface WordTimestamp {
  word: string;           // the word as it appears in the audio
  startMs: number;        // milliseconds from audio start
  endMs: number;
  isVocab: boolean;       // true if this word is in the user's vault
  cardId?: string;        // the card ID if isVocab
}

export interface StoryVocabWord {
  cardId: string;
  german: string;          // "die Speisekarte"
  germanBase: string;      // "Speisekarte" (without article)
  english: string;         // "the menu"
  article: 'der' | 'die' | 'das' | null;
  sentenceIndices: number[]; // which sentences this word appears in
}
```

---

### 1.2 — Story generation service

**File:** `src/story/story-generation.service.ts`

This service orchestrates the three-step generation pipeline:

**Step 1 — Build the prompt**

```typescript
async buildPrompt(dto: GenerateStoryDto, cards: Card[]): Promise<string> {
  const vocabList = cards
    .map(c => `${c.content.article ? c.content.article + ' ' : ''}${c.content.back} (${c.content.front})`)
    .join(', ');

  const lengthMap = { short: '80-120', medium: '200-280', long: '400-500' };
  const wordCount = lengthMap[dto.length];

  return `You are a German language teacher creating a short story for an adult learner.

TASK: Write a ${wordCount}-word German story that naturally uses as many of these vocabulary words as possible.

VOCABULARY LIST (use these German words in the story):
${vocabList}

RULES:
1. The story must be ${dto.difficulty} level (${this.ceferDescription(dto.difficulty)})
2. Use at least 70% of the vocabulary words from the list
3. Every vocabulary word must appear in a natural, everyday context — not artificially inserted
4. Write a complete narrative with a beginning, middle, and end
5. Use a variety of sentence structures to demonstrate natural German grammar
6. Include dialogue where natural
7. Vocabulary words should appear in their correct grammatical form (with correct article, conjugation, case)
8. The story should feel like something a German speaker would actually say or read

OUTPUT FORMAT (JSON only, no other text):
{
  "title": "German story title",
  "titleTranslation": "English translation of title",
  "sentences": [
    {
      "german": "German sentence here.",
      "english": "English translation here.",
      "vocabWordsUsed": ["Speisekarte", "bestellen"]
    }
  ]
}`;
}

private ceferDescription(level: string): string {
  const map = {
    'A2': 'simple present/past tense, basic vocabulary, short sentences, everyday topics',
    'B1': 'mix of tenses, subordinate clauses, broader vocabulary, narrative structure',
    'B2': 'complex sentences, passive voice, nuanced vocabulary, varied register',
  };
  return map[level] ?? map['A2'];
}
```

**Step 2 — Call Claude API (via Anthropic SDK)**

```typescript
async generateStoryText(prompt: string): Promise<GeneratedStoryContent> {
  const response = await this.anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Strip markdown fences if present
  const json = text.replace(/```json|```/g, '').trim();
  return JSON.parse(json) as GeneratedStoryContent;
}
```

**Step 3 — Generate audio + word timestamps**

```typescript
async generateAudioWithTimestamps(
  storyText: string,
): Promise<{ audioUrl: string; timestamps: WordTimestamp[]; durationMs: number }> {

  // 3a. Generate TTS audio using OpenAI
  const audioBuffer = await this.openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',       // deep male voice — suits German narration
    input: storyText,
    response_format: 'mp3',
    speed: 0.9,          // slightly slower than natural for learners
  });

  const audioBytes = Buffer.from(await audioBuffer.arrayBuffer());
  const audioUrl = await this.storageService.upload(audioBytes, 'story.mp3');

  // 3b. Pass same audio through Whisper to get word timestamps
  const transcription = await this.openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: new File([audioBytes], 'story.mp3', { type: 'audio/mp3' }),
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  // 3c. Map Whisper word timestamps to our format
  const timestamps: WordTimestamp[] = (transcription.words ?? []).map(w => ({
    word: w.word.trim(),
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    isVocab: false,  // enriched below
    cardId: undefined,
  }));

  // 3d. Mark which words are vocab words
  // (match by lowercased word stem to handle conjugations/declensions)
  const durationMs = Math.round((transcription.duration ?? 0) * 1000);

  return { audioUrl, timestamps, durationMs };
}
```

**Orchestration:**

```typescript
async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
  // 1. Load cards from the selected collections
  const cards = await this.cardRepo.findByUser(userId, {
    where: { collectionId: In(dto.collectionIds) },
  });

  if (cards.length < 5) {
    throw new BadRequestException('Need at least 5 words to generate a story');
  }

  // 2. Build prompt and call Claude
  const prompt = await this.buildPrompt(dto, cards);
  const content = await this.generateStoryText(prompt);

  // 3. Flatten sentences to plain text for TTS
  const fullText = content.sentences.map(s => s.german).join(' ');

  // 4. Generate audio + timestamps
  const { audioUrl, timestamps, durationMs } = await this.generateAudioWithTimestamps(fullText);

  // 5. Cross-reference timestamps with vocab cards
  const enrichedTimestamps = this.enrichTimestamps(timestamps, cards);
  const vocabWords = this.extractVocabWords(content.sentences, cards);

  // 6. Save to database
  return this.storyRepo.save({
    userId,
    title: content.title,
    titleTranslation: content.titleTranslation,
    bodyDe: fullText,
    bodyEn: content.sentences.map(s => s.english).join(' '),
    sentences: content.sentences.map((s, i) => ({ ...s, index: i, vocabWordIds: [] })),
    wordTimestamps: enrichedTimestamps,
    vocabWords,
    audioUrl,
    audioDurationMs: durationMs,
    sourceCollectionIds: dto.collectionIds,
    difficultyLevel: dto.difficulty,
    lengthType: dto.length,
    generatedAt: new Date().toISOString(),
    listenCount: 0,
  });
}
```

---

### 1.3 — Story controller

```typescript
// src/story/story.controller.ts
@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoryController {

  @Get()
  findAll(@CurrentUser() userId: string): Promise<Story[]> {
    return this.storyService.findAll(userId);
  }

  @Get(':id')
  findOne(@CurrentUser() userId: string, @Param('id') id: string): Promise<Story> {
    return this.storyService.findOne(userId, id);
  }

  @Post('generate')
  generate(
    @CurrentUser() userId: string,
    @Body() dto: GenerateStoryDto,
  ): Promise<Story> {
    return this.storyGenerationService.generateAndSave(userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    return this.storyService.remove(userId, id);
  }

  @Patch(':id/listen')
  recordListen(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    return this.storyService.incrementListenCount(userId, id);
  }
}

export class GenerateStoryDto {
  @IsArray() @IsUUID(undefined, { each: true })
  collectionIds: string[];

  @IsIn(['short', 'medium', 'long'])
  length: 'short' | 'medium' | 'long';

  @IsIn(['A2', 'B1', 'B2'])
  difficulty: 'A2' | 'B1' | 'B2';
}
```

---

### 1.4 — db.json additions (development)

```json
{
  "stories": [
    {
      "id": "story-001",
      "userId": "user-001",
      "title": "Ein Abend im Biergarten",
      "titleTranslation": "An Evening at the Beer Garden",
      "bodyDe": "Es war ein warmer Sommerabend als Thomas und Maria beschlossen, in den Biergarten zu gehen. Ich habe großen Hunger und Durst, sagte Thomas lachend. Der Kellner brachte ihnen sofort die Speisekarte.",
      "bodyEn": "It was a warm summer evening when Thomas and Maria decided to go to the beer garden. I am very hungry and thirsty, said Thomas, laughing. The waiter immediately brought them the menu.",
      "sentences": [
        {
          "index": 0,
          "german": "Es war ein warmer Sommerabend als Thomas und Maria beschlossen, in den Biergarten zu gehen.",
          "english": "It was a warm summer evening when Thomas and Maria decided to go to the beer garden.",
          "vocabWordIds": ["card-biergarten"]
        }
      ],
      "wordTimestamps": [
        { "word": "Es", "startMs": 0, "endMs": 220, "isVocab": false },
        { "word": "war", "startMs": 240, "endMs": 450, "isVocab": false },
        { "word": "Biergarten", "startMs": 2100, "endMs": 2680, "isVocab": true, "cardId": "card-biergarten" }
      ],
      "vocabWords": [
        { "cardId": "card-biergarten", "german": "der Biergarten", "germanBase": "Biergarten", "english": "the beer garden", "article": "der", "sentenceIndices": [0] }
      ],
      "audioUrl": "https://storage.linguacard.app/stories/story-001.mp3",
      "audioDurationMs": 178000,
      "sourceCollectionIds": ["col-001"],
      "difficultyLevel": "A2",
      "lengthType": "medium",
      "listenCount": 2,
      "lastListenedAt": "2025-05-27T10:15:00Z",
      "generatedAt": "2025-05-27T09:00:00Z"
    }
  ]
}
```

---

## Part 2 — Frontend: Angular (Ionic)

### 2.1 — Story Studio library (screen 12)

**Route:** `/stories`
**File:** `src/app/features/stories/pages/story-library/story-library.page.ts`

**Bottom nav change:** The "Listen" (audio) tab in the bottom nav becomes the "Stories" tab (book icon). The route changes from `/listen` to `/stories`. (The standalone Listen feature from Epic 2 is folded into Story Studio.)

```typescript
@Component({ selector: 'lc-story-library', standalone: true, ... })
export class StoryLibraryPage {
  stories = signal<Story[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    this.loadStories();
  }

  loadStories(): void {
    this.loading.set(true);
    this.storyService.getAll().subscribe({
      next: s => { this.stories.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  async openGenerateSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: GenerateStorySheetComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.story) {
      // Optimistically add new story to top of list
      this.stories.update(s => [data.story, ...s]);
    }
  }

  openStory(story: Story): void {
    this.router.navigate(['/stories', story.id]);
  }

  // Computed display helpers
  readingTime(story: Story): string {
    const mins = Math.ceil(story.audioDurationMs / 60000);
    return `${mins} min read`;
  }

  levelColour(level: string): { bg: string; text: string } {
    return {
      A2: { bg: '#D1FAE5', text: '#059669' },
      B1: { bg: '#FEF3C7', text: '#D97706' },
      B2: { bg: '#EAF2FC', text: '#1A56A3' },
    }[level] ?? { bg: '#F1EFE8', text: '#5F5E5A' };
  }
}
```

---

### 2.2 — Generate story sheet (screen 12a)

**File:** `src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.ts`

```typescript
@Component({ selector: 'lc-generate-story-sheet', standalone: true, ... })
export class GenerateStorySheetComponent {
  collections = this.collectionStore.liveCollections;
  selectedIds  = signal<string[]>([]);
  length       = signal<'short' | 'medium' | 'long'>('medium');
  difficulty   = signal<'A2' | 'B1' | 'B2'>('A2');
  generating   = signal(false);
  error        = signal<string | null>(null);

  canGenerate = computed(() => this.selectedIds().length > 0);

  toggleCollection(id: string): void {
    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  async generate(): Promise<void> {
    if (!this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);

    try {
      const story = await this.storyService.generate({
        collectionIds: this.selectedIds(),
        length: this.length(),
        difficulty: this.difficulty(),
      }).toPromise();

      this.modalCtrl.dismiss({ story });
    } catch (err: any) {
      this.error.set('Story generation failed. Please try again.');
    } finally {
      this.generating.set(false);
    }
  }
}
```

**Generation loading state:** When `generating()` is true, the button shows a spinner and "Generating your story…" text. The estimated wait time is shown ("Usually 10–20 seconds"). The sheet cannot be closed during generation.

---

### 2.3 — Story reader service (karaoke logic)

**File:** `src/app/features/stories/services/story-reader.service.ts`

This service owns all playback state. It runs a 100ms polling interval on `audio.currentTime` to advance the highlighted word.

```typescript
@Injectable({ providedIn: 'root' })
export class StoryReaderService {
  private audio: HTMLAudioElement | null = null;
  private _timestamps: WordTimestamp[] = [];
  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  // State signals
  isPlaying    = signal(false);
  currentMs    = signal(0);
  durationMs   = signal(0);
  activeWordIdx = signal(-1);   // index into _timestamps array
  speed        = signal(1.0);

  loadStory(story: Story): void {
    this.stop();
    this._timestamps = story.wordTimestamps;

    this.audio = new Audio(story.audioUrl);
    this.audio.playbackRate = this.speed();
    this.durationMs.set(story.audioDurationMs);

    this.audio.addEventListener('timeupdate', () => {
      const ms = (this.audio!.currentTime * 1000);
      this.currentMs.set(ms);
      this.updateActiveWord(ms);
    });
    this.audio.addEventListener('ended', () => {
      this.isPlaying.set(false);
      this.activeWordIdx.set(-1);
    });
  }

  private updateActiveWord(currentMs: number): void {
    const idx = this._timestamps.findIndex(
      t => currentMs >= t.startMs && currentMs < t.endMs
    );
    if (idx !== this.activeWordIdx()) {
      this.activeWordIdx.set(idx);
    }
  }

  play(): void {
    this.audio?.play();
    this.isPlaying.set(true);
  }

  pause(): void {
    this.audio?.pause();
    this.isPlaying.set(false);
  }

  toggle(): void {
    this.isPlaying() ? this.pause() : this.play();
  }

  seekMs(ms: number): void {
    if (!this.audio) return;
    this.audio.currentTime = ms / 1000;
  }

  skipMs(deltaMs: number): void {
    this.seekMs(this.currentMs() + deltaMs);
  }

  setSpeed(speed: number): void {
    this.speed.set(speed);
    if (this.audio) this.audio.playbackRate = speed;
  }

  stop(): void {
    this.audio?.pause();
    this.audio = null;
    this.isPlaying.set(false);
    this.activeWordIdx.set(-1);
    this.currentMs.set(0);
    if (this._pollInterval) clearInterval(this._pollInterval);
  }
}
```

---

### 2.4 — Story reader component (screens 12b + 12c)

**Route:** `/stories/:id`
**File:** `src/app/features/stories/pages/story-reader/story-reader.page.ts`

```typescript
@Component({ selector: 'lc-story-reader', standalone: true, ... })
export class StoryReaderPage implements OnInit, OnDestroy {
  story   = signal<Story | null>(null);
  view    = signal<'german' | 'translation'>('german');
  popup   = signal<{ word: StoryVocabWord; x: number; y: number } | null>(null);

  // Derived — for the German text view
  wordSegments = computed(() => {
    if (!this.story()) return [];
    return this.buildWordSegments(this.story()!);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.storyService.getById(id).subscribe(story => {
      this.story.set(story);
      this.reader.loadStory(story);
    });
  }

  // Build word segments from bodyDe + timestamps for template rendering
  private buildWordSegments(story: Story): WordSegment[] {
    return story.wordTimestamps.map((t, idx) => ({
      word: t.word,
      timestampIdx: idx,
      isVocab: t.isVocab,
      cardId: t.cardId,
      vocabData: t.cardId
        ? story.vocabWords.find(v => v.cardId === t.cardId) ?? null
        : null,
    }));
  }

  // Template uses this to check if a word should be highlighted
  isActive(timestampIdx: number): boolean {
    return this.reader.activeWordIdx() === timestampIdx;
  }

  onWordTap(segment: WordSegment, event: MouseEvent): void {
    if (!segment.isVocab || !segment.vocabData) return;
    event.stopPropagation();
    this.popup.set({
      word: segment.vocabData,
      x: (event.target as HTMLElement).offsetLeft,
      y: (event.target as HTMLElement).offsetTop - 80,
    });
    // Auto-dismiss after 3 seconds
    setTimeout(() => this.popup.set(null), 3000);
  }

  ngOnDestroy(): void {
    this.reader.stop();
    this.storyService.recordListen(this.story()?.id!).subscribe();
  }
}
```

**Template (German view — screen 12b):**
```html
<!-- story-reader.page.html (German view) -->
<div class="sr-text-block" (click)="popup.set(null)">
  @for (segment of wordSegments(); track segment.timestampIdx) {
    <span
      class="sr-word"
      [class.vocab]="segment.isVocab"
      [class.active]="isActive(segment.timestampIdx)"
      (click)="onWordTap(segment, $event)">{{ segment.word }}</span>
    <span> </span>
  }

  @if (popup()) {
    <div class="sr-word-popup"
         [style.left.px]="popup()!.x"
         [style.top.px]="popup()!.y">
      <strong>{{ popup()!.word.german }}</strong><br>
      {{ popup()!.word.english }}<br>
      <span style="opacity:0.6;font-size:10px;">{{ popup()!.word.article ? popup()!.word.article + ' · ' : '' }}tap card to review</span>
    </div>
  }
</div>
```

---

### 2.5 — Post-story screen (screen 12d)

**Route:** `/stories/:id/complete`
**File:** `src/app/features/stories/pages/story-complete/story-complete.page.ts`

After the audio reaches the end (or the user manually marks as complete), navigate here.

```typescript
@Component({ selector: 'lc-story-complete', standalone: true, ... })
export class StoryCompletePage {
  story = signal<Story | null>(null);

  // The vocabulary words that appeared in this story
  storyVocabCards = computed(() => {
    if (!this.story()) return [];
    return this.story()!.vocabWords.map(v => ({
      ...v,
      card: this.cardStore.cards().find(c => c.id === v.cardId),
    }));
  });

  reviewStoryWords(): void {
    const ids = this.storyVocabCards()
      .map(v => v.card?.id)
      .filter(Boolean) as string[];
    const cards = this.cardStore.cards().filter(c => ids.includes(c.id));
    if (cards.length) {
      this.reviewStore.startSession(cards, null);
      this.router.navigate(['/review/player']);
    }
  }

  generateAnother(): void {
    this.router.navigate(['/stories'], { state: { openGenerate: true } });
  }
}
```

---

### 2.6 — Story service (frontend)

**File:** `src/app/data/services/story.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class StoryService {
  private apiUrl = `${environment.apiUrl}/stories`;

  getAll(): Observable<Story[]> {
    return this.http.get<Story[]>(this.apiUrl, {
      params: { userId: this.auth.userId()! },
    });
  }

  getById(id: string): Observable<Story> {
    return this.http.get<Story>(`${this.apiUrl}/${id}`);
  }

  generate(dto: GenerateStoryDto): Observable<Story> {
    return this.http.post<Story>(`${this.apiUrl}/generate`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  recordListen(id: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${id}/listen`, {});
  }
}
```

---

## Part 3 — AI Prompt Engineering

The prompt structure directly determines story quality. These are the key design decisions:

### 3.1 — Vocabulary coverage guarantee

The prompt instructs the AI to use "at least 70% of the vocabulary words from the list." For a 95-word collection this means ~66 words in a medium story of ~240 words — which is achievable and produces a natural narrative density.

### 3.2 — Level calibration by CEFR

| Level | Sentence complexity | Tense variety | Grammar focus |
|---|---|---|---|
| A2 | Short, simple | Present + simple past | Subject-verb-object, basic adjective agreement |
| B1 | Medium, subordinate clauses | Present, past, perfect | Relative clauses, modal verbs, separable verbs |
| B2 | Long, complex | All tenses including subjunctive | Passive voice, complex subordination, formal register |

### 3.3 — Grammar teaching embedded in stories

The prompt is designed to teach grammar organically. For a German chapter 6 collection:
- Separable verbs (`ab|holen`, `an|rufen`, `auf|hören`) appear in context showing the correct split form
- Accusative/Dative case with articles demonstrated through natural object use
- Modal verbs (`können`, `müssen`, `wollen`) in natural dialogue

### 3.4 — Everyday authenticity

The prompt explicitly requires everyday context — not artificial sentences like "The menu is on the table" but a scene like ordering at a restaurant that mirrors how the word is actually used.

---

## Part 4 — Routing

```typescript
// src/app/features/stories/stories.routes.ts
export const storiesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/story-library/story-library.page').then(m => m.StoryLibraryPage),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/story-reader/story-reader.page').then(m => m.StoryReaderPage),
  },
  {
    path: ':id/complete',
    loadComponent: () =>
      import('./pages/story-complete/story-complete.page').then(m => m.StoryCompletePage),
  },
];
```

In `app.routes.ts`: add `{ path: 'stories', loadChildren: () => import('./features/stories/stories.routes').then(r => r.storiesRoutes) }`.

---

## Files to create

| File | Purpose |
|---|---|
| `src/story/entities/story.entity.ts` | Story database entity |
| `src/story/story.module.ts` | NestJS module |
| `src/story/story.controller.ts` | REST endpoints |
| `src/story/story.service.ts` | CRUD operations |
| `src/story/story-generation.service.ts` | AI generation pipeline |
| `src/story/dto/generate-story.dto.ts` | Request DTO |
| `src/app/features/stories/stories.routes.ts` | Angular routes |
| `src/app/features/stories/pages/story-library/` | Screen 12 (3 files) |
| `src/app/features/stories/pages/story-reader/` | Screens 12b + 12c (3 files) |
| `src/app/features/stories/pages/story-complete/` | Screen 12d (3 files) |
| `src/app/features/stories/components/generate-story-sheet/` | Screen 12a (3 files) |
| `src/app/data/services/story.service.ts` | HTTP service |
| `src/app/features/stories/services/story-reader.service.ts` | Karaoke playback logic |
| `src/app/data/models/story.model.ts` | TypeScript interfaces |

## Files to modify

| File | Change |
|---|---|
| `src/app/app.routes.ts` | Add `/stories` lazy route |
| `src/app/shared/components/app-shell/app-shell.component.html` | Change "Listen" tab to "Stories" (book icon, route `/stories`) |
| `db.json` | Add `stories` array with 2 sample stories |

---

## Acceptance criteria

### AC-1 — Story Studio library
- [ ] "Stories" bottom nav tab navigates to `/stories` with book icon
- [ ] Library shows a "Generate a new story" hero CTA at the top (matches screen 12)
- [ ] Saved story cards show: German title, reading time, source collection, number of vocab words, word chips (first 3 with article colour coding), difficulty level pill, "Listen · Read" button
- [ ] Empty state: "You have no stories yet. Generate your first one!" with CTA
- [ ] Tapping a story card navigates to `/stories/:id`

### AC-2 — Generation sheet
- [ ] Tapping "Generate" hero CTA opens bottom sheet at 85% height (screen 12a)
- [ ] Collections list shows all user collections with word counts
- [ ] Multi-select works — multiple collections can be selected simultaneously
- [ ] Length chips (Short / Medium / Long) are single-select
- [ ] Difficulty chips (A2 / B1 / B2) are single-select; A2 is default
- [ ] "Generate" button is disabled if no collection selected
- [ ] During generation: button shows spinner + "Generating your story…" text
- [ ] Estimated wait time shown: "Usually 10–20 seconds"
- [ ] On success: sheet closes, new story appears at top of library (optimistic)
- [ ] On error: error message shown inside sheet, sheet remains open

### AC-3 — Story content quality
- [ ] Generated story uses at least 70% of vocabulary words from the selected collection(s)
- [ ] Every vocabulary word appears in a natural, everyday sentence — not artificially placed
- [ ] A2 stories use simple present/past; B1 adds subordinate clauses; B2 uses complex structures
- [ ] Story has a clear narrative arc (beginning, middle, end)
- [ ] Story is approximately the correct length: Short ~100 words, Medium ~240 words, Long ~450 words
- [ ] Title is in German with English translation stored

### AC-4 — Audio generation
- [ ] Audio is generated at 0.9× natural speed (learner-appropriate)
- [ ] Audio file is accessible via URL and plays correctly in the app
- [ ] Audio duration is stored in milliseconds
- [ ] Word timestamps are generated via Whisper and stored alongside the audio

### AC-5 — Karaoke reading (screen 12b)
- [ ] Story text renders in the reader with each word as a separate span
- [ ] As audio plays, the current word gets `.active` highlight (brand green tint background)
- [ ] Vocabulary words have brand-colour underline and bold when not active
- [ ] Vocabulary words get brand-white highlight when active (active overrides vocab style)
- [ ] Tapping a vocabulary word shows a popup with: German (with article), English, word type
- [ ] Popup auto-dismisses after 3 seconds
- [ ] Tapping anywhere else dismisses the popup

### AC-6 — Audio player controls
- [ ] Play/pause button works correctly
- [ ] ±10s skip buttons work correctly
- [ ] Progress bar reflects current playback position
- [ ] Tapping on the progress bar seeks to that position
- [ ] Speed cycle button cycles: 0.5× → 0.75× → 1.0× → 1.25× → 1.5× → 0.5×
- [ ] Speed changes take effect immediately without restarting audio
- [ ] Background playback continues when app is backgrounded (Capacitor Audio session)

### AC-7 — Translation view (screen 12c)
- [ ] Toggling "🇬🇧 Translation" switches to bilingual sentence-pair view
- [ ] Each sentence block shows German above and English below with a divider
- [ ] Vocabulary words are **bold** in both the German and English lines
- [ ] Audio player controls remain visible and functional in translation view
- [ ] The currently playing sentence block is highlighted with a brand-light border
- [ ] Toggling back to "🇩🇪 German" returns to karaoke view at the same playback position

### AC-8 — Post-story completion (screen 12d)
- [ ] When audio ends, app navigates to `/stories/:id/complete`
- [ ] Completion banner shows story emoji, "You finished the story!", duration, and vocab word count
- [ ] Vocabulary words from the story are listed with article-colour backgrounds, article badge, German word, English translation, and mastery dot
- [ ] "Review these N words now" starts a review session with only these cards
- [ ] "Generate another story" navigates back to library with generate sheet open
- [ ] Listen count on the story increments by 1 after completion

### AC-9 — Data persistence
- [ ] Stories are saved to `stories` table with all required fields
- [ ] `userId` is enforced — user A cannot see or delete user B's stories
- [ ] `DELETE /stories/:id` correctly removes the story and its audio file
- [ ] Stories persist across app restarts (loaded from API on boot)
- [ ] `listenCount` and `lastListenedAt` update correctly after each completion

---

## Step-by-step implementation order

### Phase 1 — Backend foundation (implement first)
1. Create `Story` entity and migration
2. Create `StoryService` (CRUD only)
3. Create `StoryController` with all endpoints
4. Add `stories` seed data to `db.json`

### Phase 2 — Generation pipeline
5. Add `@anthropic-ai/sdk` and `openai` npm packages to NestJS
6. Implement `StoryGenerationService.buildPrompt()`
7. Implement `StoryGenerationService.generateStoryText()` — test with Claude API
8. Implement `StoryGenerationService.generateAudioWithTimestamps()` — test TTS + Whisper
9. Implement `StoryGenerationService.generateAndSave()` orchestration
10. Wire `POST /stories/generate` in controller

### Phase 3 — Frontend screens
11. Create `StoryLibraryPage` (screen 12)
12. Create `GenerateStorySheetComponent` (screen 12a)
13. Create `StoryReaderService` (karaoke engine)
14. Create `StoryReaderPage` German view (screen 12b)
15. Create `StoryReaderPage` translation toggle (screen 12c)
16. Create `StoryCompletePage` (screen 12d)

### Phase 4 — Integration
17. Change bottom nav "Listen" → "Stories" with book icon
18. Wire "Review these N words" to `ReviewSessionStore`
19. Add offline caching: store audio file locally on first listen

---

## Non-goals (out of scope for this story)

- User editing of AI-generated story text
- Grammar annotation / hover-over grammar explanations (future Epic)
- User uploading their own text to read with karaoke
- Multi-voice "dialogue mode" (different voices per character)
- Story sharing between users
- Story difficulty auto-detection from the learner's mastery level (future — currently manual)