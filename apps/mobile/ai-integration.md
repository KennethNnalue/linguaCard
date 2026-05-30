# AI Integration — User Stories
## Epic 7 · AI Platform & Story Generation

> **Scope:** This epic covers the full implementation of the `features/ai/` platform module, real AI story generation, AI audio narration, word pronunciation, extended story lengths, and offline-first asset caching.
>
> **Prerequisites:** Stories feature scaffold complete (LC-043). `StoryStore`, `StoryApiService`, `story-reader`, `story-library`, `generate-story-sheet` all exist. `StoriesService` on NestJS with seed payload active.
>
> **Ticket numbering:** LC-050 through LC-068 (continuing from LC-043). Gemini TTS work: LC-069 through LC-071.

---

## Story map

| Phase | Ticket | Title | Points |
|-------|--------|-------|--------|
| 1 — AI scaffold | LC-050 | AI provider interface & Anthropic adapter | 3 |
| 1 — AI scaffold | LC-051 | OpenAI adapter (TTS + Whisper) | 3 |
| 1 — AI scaffold | LC-052 | AI orchestration service & factory | 2 |
| 2 — Real generation | LC-053 | Real story text generation (NestJS) | 5 |
| 2 — Real generation | LC-054 | Story audio generation + word timestamps (NestJS) | 8 |
| 2 — Real generation | LC-055 | Wire real generation into StoriesService | 3 |
| 3 — Audio caching | LC-056 | AI audio cache service (Angular) | 5 |
| 3 — Audio caching | LC-057 | Offline story audio — download on first listen | 3 |
| 4 — Pronunciation | LC-058 | Word pronunciation via AI (vault + review) | 5 |
| 5 — Length variants | LC-059 | Extended story lengths (very-long, extra-long) | 3 |
| 5 — Length variants | LC-060 | Prompt engineering for extra-long / podcast format | 3 |
| 6 — Shared domain | LC-061 | Shared domain type extensions | 1 |
| 7 — Story import fix | LC-062 | Fix story.store.ts import path | 1 |
| 8 — Sync | LC-063 | Story sync handler (offline → server) | 3 |
| 9 — Env & config | LC-064 | Environment config for AI providers | 2 |
| 10 — Polish | LC-065 | Generation loading UX (streaming progress) | 3 |
| 10 — Polish | LC-066 | Error handling & retry UI | 2 |
| 11 — Future hooks | LC-067 | Pronunciation cache & reuse across features | 3 |
| 11 — Future hooks | LC-068 | AI usage tracking service | 2 |
| 12 — Gemini TTS | LC-069 | Gemini TTS adapter — NestJS (generateSpeech + /ai/tts endpoint) | 3 |
| 12 — Gemini TTS | LC-070 | Gemini TTS adapter — Angular (proxy client) | 2 |
| 12 — Gemini TTS | LC-071 | Wire Gemini TTS into story audio pipeline and pronunciation service | 3 |

---

---

## LC-061 · Fix shared domain type extensions

**Epic:** 7 — AI Platform
**Phase:** 0 — Do this first (unblocks everything else)
**Points:** 1

### Context

Small but load-bearing. `story.store.ts` still imports from `'../../../core/models/mock-data'` in one place. `StoryLength` is missing `'very-long'` and `'extra-long'`. These need to be correct before any new code uses them.

### User story

As a developer, I want all shared types to be correct and all imports to use the canonical `@lingua-card/shared/domain` path, so that no file has a hidden dependency on the re-export barrel in `core/models/mock-data.ts`.

### Files to modify

| File | Change |
|------|--------|
| `libs/shared/domain/src/index.ts` | Extend `StoryLength`, add `AIProviderType` |
| `apps/mobile/src/app/features/stories/store/story.store.ts` | Fix import path |

### Acceptance criteria

- [ ] `StoryLength` in `libs/shared/domain/src/index.ts` is: `'short' | 'medium' | 'long' | 'very-long' | 'extra-long'`
- [ ] New enum exported: `export type AIProviderType = 'anthropic' | 'openai' | 'gemini'`
- [ ] New interface exported: `PronunciationRequest { cardId: string; word: string; language: string; voice?: string }`
- [ ] `story.store.ts` import changed from `'../../../core/models/mock-data'` to `'@lingua-card/shared/domain'`
- [ ] `GenerateStoryDto` gains optional field: `provider?: AIProviderType`
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`
- [ ] No other files broken by the type extension (existing `'short' | 'medium' | 'long'` values still valid)

### Implementation notes

```typescript
// libs/shared/domain/src/index.ts

export type StoryLength = 'short' | 'medium' | 'long' | 'very-long' | 'extra-long';

export type AIProviderType = 'anthropic' | 'openai' | 'gemini';

export interface PronunciationRequest {
  cardId: string;
  word: string;
  language: string;    // e.g. 'de-DE'
  voice?: string;      // provider-specific voice ID
}

export interface GenerateStoryDto {
  collectionIds: string[];
  length: StoryLength;
  difficulty: StoryDifficulty;
  provider?: AIProviderType;  // optional override
}
```

### Non-goals

- Do not rename or move `StoryDifficulty` — it is already correct.
- Do not add audio-specific types here — those live in `features/ai/models/`.

---

---

## LC-064 · Environment config for AI providers

**Epic:** 7 — AI Platform
**Phase:** 0 — Do this first (unblocks LC-050, LC-053)
**Points:** 2

### Context

API keys and provider defaults need to be in the environment files, not hardcoded. NestJS needs its own config as well.

### User story

As a developer, I want AI provider credentials and defaults to be managed through environment configuration on both the Angular app and the NestJS API, so that keys are never in source code and switching providers requires only a config change.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/environments/environment.ts` | Add `ai` block |
| `apps/mobile/src/environments/environment.production.ts` | Add `ai` block (empty keys, flag) |
| `apps/api/.env.example` | Add AI key placeholders |
| `apps/api/src/config/ai.config.ts` | New: NestJS ConfigService wrapper |

### Acceptance criteria

- [ ] `environment.ts` contains an `ai` config block (see below)
- [ ] `environment.production.ts` contains the same block with empty string keys and `production: true`
- [ ] `apps/api/.env.example` lists `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_DEFAULT_PROVIDER`, `AI_STORAGE_BUCKET`
- [ ] `apps/api/src/config/ai.config.ts` exports `AiConfig` interface and `aiConfig()` factory registered with `ConfigModule`
- [ ] No API key appears in any committed file other than `.env.example` with placeholder values
- [ ] `.env` is in `.gitignore`

### Implementation notes

```typescript
// apps/mobile/src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  ai: {
    defaultProvider: 'anthropic' as AIProviderType,
    // Keys are only used server-side via NestJS.
    // On the Angular side this block controls feature flags only.
    pronunciationEnabled: true,
    storyGenerationEnabled: true,
  },
};
```

```typescript
// apps/api/src/config/ai.config.ts
export interface AiConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  defaultProvider: 'anthropic' | 'openai' | 'gemini';
  storageBucket: string;
}

export const aiConfig = (): { ai: AiConfig } => ({
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    defaultProvider: (process.env.AI_DEFAULT_PROVIDER ?? 'anthropic') as AiConfig['defaultProvider'],
    storageBucket: process.env.AI_STORAGE_BUCKET ?? 'lingua-card-audio-dev',
  },
});
```

---

---

## LC-050 · AI provider interface & Anthropic adapter

**Epic:** 7 — AI Platform
**Phase:** 1 — AI module scaffold
**Points:** 3
**Depends on:** LC-061, LC-064

### Context

This is the foundation of the entire AI platform. Nothing in the app calls vendor SDKs directly after this is in place. The `AIProvider` interface is the contract; the Anthropic adapter is the first implementation.

### User story

As a developer, I want a vendor-agnostic `AIProvider` interface and a working Anthropic adapter, so that any feature can generate text through a stable contract without knowing which AI vendor is being used.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/providers/ai-provider.interface.ts` | Core contract |
| `apps/mobile/src/app/features/ai/providers/anthropic.adapter.ts` | Anthropic implementation |
| `apps/mobile/src/app/features/ai/providers/ai-provider.factory.ts` | Returns correct adapter from config |
| `apps/mobile/src/app/features/ai/models/ai-request.model.ts` | Typed request/response models |
| `apps/mobile/src/app/features/ai/models/ai-response.model.ts` | AI response types |
| `apps/mobile/src/app/features/ai/index.ts` | Public barrel export |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/app.config.ts` | Add `provideAi()` |

### Acceptance criteria

- [ ] `AIProvider` interface defines `generateText()`, `generateSpeech()`, `transcribeWithTimestamps()` (see types below)
- [ ] `AnthropicAdapter` implements `AIProvider` using `@anthropic-ai/sdk` — package must be added to `apps/mobile/package.json` if not already present
- [ ] `AnthropicAdapter.generateText()` calls `claude-sonnet-4-20250514` with the provided messages and returns `AITextResponse`
- [ ] `AiProviderFactory.create()` reads `environment.ai.defaultProvider` and returns the correct adapter
- [ ] `provideAi()` registers the factory and adapter with Angular DI in `providedIn: 'root'`
- [ ] No feature file outside `features/ai/` imports from `@anthropic-ai/sdk` directly — ESLint rule enforced (see notes)
- [ ] Unit test: `AnthropicAdapter.generateText()` with mocked `Anthropic` client resolves to `AITextResponse`
- [ ] `index.ts` barrel exports `AIProvider`, `AITextRequest`, `AITextResponse`, `AiOrchestrationService`, `AIProviderType`

### Implementation notes

```typescript
// features/ai/providers/ai-provider.interface.ts
export interface AITextRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface AITextResponse {
  text: string;
  provider: AIProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AISpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
}

export interface AISpeechResponse {
  audioBuffer: ArrayBuffer;
  durationMs: number;
}

export interface AIProvider {
  readonly name: AIProviderType;
  generateText(request: AITextRequest): Promise<AITextResponse>;
  generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse>;
  transcribeWithTimestamps(audioBuffer: ArrayBuffer): Promise<WordTimestamp[]>;
}
```

```typescript
// features/ai/providers/anthropic.adapter.ts
@Injectable({ providedIn: 'root' })
export class AnthropicAdapter implements AIProvider {
  readonly name: AIProviderType = 'anthropic';
  private client: Anthropic;

  constructor() {
    // NOTE: On Angular side, API calls go through the NestJS backend.
    // This adapter is used on the NestJS side via DI injection.
    // On Angular, this adapter is registered but calls are proxied via AiOrchestrationService → API.
    this.client = new Anthropic({ apiKey: '' }); // Key only set server-side
  }

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: request.maxTokens ?? 2000,
      messages: request.messages,
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      text,
      provider: 'anthropic',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  // Speech + transcription delegated to OpenAI adapter
  generateSpeech(): Promise<AISpeechResponse> {
    throw new Error('AnthropicAdapter does not support speech generation. Use OpenAIAdapter.');
  }

  transcribeWithTimestamps(): Promise<WordTimestamp[]> {
    throw new Error('AnthropicAdapter does not support transcription. Use OpenAIAdapter.');
  }
}
```

### ESLint rule

Add to `apps/mobile/.eslintrc.json`:
```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["@anthropic-ai/*", "openai"],
        "message": "Vendor SDKs must only be imported inside features/ai/providers/. Use AiOrchestrationService instead."
      }]
    }]
  }
}
```

---

---

## LC-051 · OpenAI adapter (TTS + Whisper)

**Epic:** 7 — AI Platform
**Phase:** 1 — AI module scaffold
**Points:** 3
**Depends on:** LC-050

### User story

As a developer, I want an OpenAI adapter that handles speech generation (TTS) and word-level transcription (Whisper), so that the AI platform can produce audio with word timestamps without any feature knowing it uses OpenAI under the hood.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/providers/openai.adapter.ts` | OpenAI TTS + Whisper implementation |
| `apps/api/src/ai/providers/openai.adapter.ts` | NestJS-side adapter (actual API calls happen here) |

### Acceptance criteria

- [ ] `OpenAIAdapter` implements `AIProvider` interface
- [ ] `generateSpeech()` calls `openai.audio.speech.create()` with `tts-1`, voice `'onyx'`, speed `0.9`, format `'mp3'`
- [ ] `transcribeWithTimestamps()` calls Whisper with `response_format: 'verbose_json'` and `timestamp_granularities: ['word']`
- [ ] Returned `WordTimestamp[]` maps `{ word, start_time * 1000, end_time * 1000 }` from Whisper to our model `{ word, startMs, endMs, isVocab: false }`
- [ ] `generateText()` on `OpenAIAdapter` throws with a clear message (text generation uses Anthropic, not OpenAI)
- [ ] Unit test: `transcribeWithTimestamps()` with mocked Whisper response returns correctly shaped `WordTimestamp[]`
- [ ] Both adapters are exported from `features/ai/providers/index.ts`

### Implementation notes

```typescript
// features/ai/providers/openai.adapter.ts
@Injectable({ providedIn: 'root' })
export class OpenAIAdapter implements AIProvider {
  readonly name: AIProviderType = 'openai';
  private client: OpenAI;

  constructor(@Inject(AI_CONFIG) private config: AiConfig) {
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse> {
    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: (request.voice as 'onyx') ?? 'onyx',
      input: request.text,
      response_format: 'mp3',
      speed: request.speed ?? 0.9,
    });
    const audioBuffer = await response.arrayBuffer();
    // Duration estimated from file size; will be corrected by Whisper transcription
    const durationMs = Math.round((audioBuffer.byteLength / 16000) * 1000);
    return { audioBuffer, durationMs };
  }

  async transcribeWithTimestamps(audioBuffer: ArrayBuffer): Promise<WordTimestamp[]> {
    const file = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
    const transcription = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    return (transcription.words ?? []).map(w => ({
      word: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      isVocab: false,  // Caller is responsible for marking vocab words
      cardId: undefined,
    }));
  }

  generateText(): Promise<AITextResponse> {
    throw new Error('OpenAIAdapter does not support text generation. Use AnthropicAdapter.');
  }
}
```

---

---

## LC-052 · AI orchestration service & factory

**Epic:** 7 — AI Platform
**Phase:** 1 — AI module scaffold
**Points:** 2
**Depends on:** LC-050, LC-051

### User story

As a developer, I want a single `AiOrchestrationService` that features can inject to request any AI capability, so that features never need to choose between providers or manage provider lifecycle.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/orchestration/ai-orchestration.service.ts` | Public surface for all features |
| `apps/mobile/src/app/features/ai/orchestration/model-selector.service.ts` | Picks model based on task |
| `apps/mobile/src/app/features/ai/ai.providers.ts` | `provideAi()` function |

### Acceptance criteria

- [ ] `AiOrchestrationService` has three public methods: `generateStoryText()`, `generateSpeechWithTimestamps()`, `generatePronunciation()`
- [ ] Each method internally routes to the correct adapter via `AiProviderFactory`
- [ ] `generateStoryText()` always uses Anthropic adapter; `generateSpeechWithTimestamps()` always uses OpenAI adapter
- [ ] `provideAi()` exported from `ai.providers.ts` registers all services with Angular DI
- [ ] `app.config.ts` updated to call `provideAi()` in the providers array
- [ ] Calling any method when the corresponding provider is not configured throws `AiProviderNotConfiguredError` with a helpful message
- [ ] Unit test: `AiOrchestrationService.generateStoryText()` calls `AnthropicAdapter.generateText()` with correct params

### Implementation notes

```typescript
// features/ai/orchestration/ai-orchestration.service.ts
@Injectable({ providedIn: 'root' })
export class AiOrchestrationService {
  private readonly anthropic = inject(AnthropicAdapter);
  private readonly openai = inject(OpenAIAdapter);

  async generateStoryText(config: StoryGenerationConfig): Promise<GeneratedStoryContent> {
    const response = await this.anthropic.generateText({
      messages: [{ role: 'user', content: config.prompt }],
      maxTokens: config.maxTokens ?? 2000,
    });

    const json = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(json) as GeneratedStoryContent;
  }

  async generateSpeechWithTimestamps(
    text: string,
    voice?: string,
  ): Promise<{ audioBuffer: ArrayBuffer; timestamps: WordTimestamp[]; durationMs: number }> {
    const speech = await this.openai.generateSpeech({ text, voice });
    const timestamps = await this.openai.transcribeWithTimestamps(speech.audioBuffer);
    return { audioBuffer: speech.audioBuffer, timestamps, durationMs: speech.durationMs };
  }

  async generatePronunciation(request: PronunciationRequest): Promise<AISpeechResponse> {
    return this.openai.generateSpeech({
      text: request.word,
      language: request.language,
      speed: 0.85,  // Slightly slower for clear pronunciation
    });
  }
}
```

---

---

## LC-053 · Real story text generation (NestJS)

**Epic:** 7 — AI Platform
**Phase:** 2 — Real generation
**Points:** 5
**Depends on:** LC-050, LC-052, LC-064

### Context

The NestJS `StoriesService.generate()` currently returns a hardcoded seed story. This story replaces that with a real Anthropic API call. Audio is still null (that is LC-054). This makes the app generate real, personalised German stories from the user's vocabulary.

### User story

As a language learner, I want the app to generate a real German story using my vocabulary words, so that every generated story is unique and contextually relevant to the words I'm learning.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/stories.service.ts` | Replace seed story with `StoryGenerationService.generateText()` call |
| `apps/api/src/stories/story-generation.service.ts` | Implement real AI text generation |
| `apps/api/src/stories/story-prompt.builder.ts` | New: builds the prompt from DTO + cards |
| `apps/api/src/stories/stories.module.ts` | Register new services |
| `apps/api/src/ai/ai.module.ts` | New: NestJS AI module with adapters |
| `apps/api/src/ai/providers/anthropic.adapter.ts` | New: NestJS-side Anthropic adapter |

### Acceptance criteria

- [ ] `POST /stories/generate` returns a real AI-generated story in German with correct `bodyDe`, `bodyEn`, `sentences[]`, `vocabWords[]`
- [ ] Story uses ≥70% of vocabulary words from the requested `collectionIds`
- [ ] Each `sentences[]` entry has correct `german`, `english`, `vocabWordIds` fields
- [ ] `vocabWords[]` entries correctly reference `cardId` values from the user's vault
- [ ] Story difficulty matches the requested level (A2 / B1 / B2) based on CEFR guidelines in the prompt
- [ ] Story word count is within ±20% of the target for the requested length (short: 80–150, medium: 200–320, long: 400–520)
- [ ] `audioUrl` is `null` and `audioDurationMs` is `0` (audio comes in LC-054)
- [ ] If Claude API returns invalid JSON, service throws `StoryGenerationFailedError` with the raw response logged
- [ ] If `collectionIds` resolve to zero cards, service throws `BadRequestException('No cards found for the given collections')`
- [ ] Generation time p95 < 15 seconds (monitored via response time logging)
- [ ] Unit test: `StoryPromptBuilder.build()` with 5 mock cards at A2 produces a prompt containing all 5 vocabulary items

### Implementation notes

```typescript
// apps/api/src/stories/story-prompt.builder.ts
@Injectable()
export class StoryPromptBuilder {
  build(dto: GenerateStoryDto, cards: Card[]): string {
    const vocabList = cards
      .map(c => `${c.content.article ? c.content.article + ' ' : ''}${c.content.back} = ${c.content.front}`)
      .join('\n');

    const wordTargets: Record<StoryLength, string> = {
      'short': '80–150',
      'medium': '200–320',
      'long': '400–520',
      'very-long': '700–900',
      'extra-long': '1100–1400',
    };

    const cefrDescriptions: Record<StoryDifficulty, string> = {
      'A1': 'extremely simple, present tense only, 3–5 word sentences, most basic vocabulary',
      'A2': 'simple present and past tense, basic vocabulary, short sentences, everyday topics',
      'B1': 'mix of tenses, subordinate clauses, broader vocabulary, narrative structure',
      'B2': 'complex sentences, passive voice, nuanced vocabulary, varied register, subjunctive mood',
    };

    return `You are a German language teacher creating a personalised story for an adult learner.

TASK: Write a ${wordTargets[dto.length]}-word German story that naturally incorporates the learner's vocabulary.

VOCABULARY LIST (use these words in the story — format: German = English):
${vocabList}

RULES:
1. Difficulty level: ${dto.difficulty} — ${cefrDescriptions[dto.difficulty]}
2. Use at least 70% of the vocabulary words from the list above
3. Every vocabulary word must appear in a natural, everyday context — never artificially inserted
4. Write a complete narrative with a clear beginning, middle, and end
5. Include natural dialogue where it fits the story
6. Vocabulary words must appear in their correct grammatical form (correct article, conjugation, case)
7. The story must feel authentic — something a native German speaker would actually say or read
8. Do NOT add words outside the vocabulary list to meet a quota — only use them naturally

OUTPUT FORMAT — respond with valid JSON only, no markdown fences, no other text:
{
  "title": "Story title in German",
  "titleTranslation": "English translation of title",
  "sentences": [
    {
      "german": "German sentence.",
      "english": "English translation.",
      "vocabWordsUsed": ["Speisekarte", "bestellen"]
    }
  ]
}`;
  }
}
```

```typescript
// apps/api/src/stories/story-generation.service.ts (text only)
@Injectable()
export class StoryGenerationService {
  constructor(
    private readonly promptBuilder: StoryPromptBuilder,
    private readonly anthropic: AnthropicAdapter,
  ) {}

  async generateText(dto: GenerateStoryDto, cards: Card[]): Promise<GeneratedStoryContent> {
    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    const prompt = this.promptBuilder.build(dto, cards);

    let rawText: string;
    try {
      const response = await this.anthropic.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 3000,
      });
      rawText = response.text;
    } catch (err) {
      this.logger.error('Anthropic API error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }

    const clean = rawText.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean) as GeneratedStoryContent;
    } catch {
      this.logger.error('JSON parse failed. Raw response:', rawText);
      throw new InternalServerErrorException('Story generation returned invalid data.');
    }
  }
}
```

### Prompt quality checklist (manual QA)

Before marking this story done, generate at least 3 stories and verify:
- [ ] A2 short: all sentences ≤12 words, present/past tense only, ≥70% vocab used
- [ ] B1 medium: includes at least one subordinate clause, modal verb, ≥70% vocab
- [ ] B2 long: passive voice appears at least once, complex sentence structures present

---

---

## LC-054 · Story audio generation + word timestamps (NestJS)

**Epic:** 7 — AI Platform
**Phase:** 2 — Real generation
**Points:** 8
**Depends on:** LC-051, LC-053

### Context

This is the highest-complexity story in the epic. It completes the generation pipeline by adding TTS audio and Whisper word timestamps. After this, the story reader can do karaoke highlighting.

### User story

As a language learner, I want to listen to my generated story with word-level karaoke highlighting, so that I can follow along and associate written German words with their spoken pronunciation.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-generation.service.ts` | Add `generateAudio()` and `generateAndSave()` |
| `apps/api/src/stories/story-audio.service.ts` | New: TTS + Whisper pipeline |
| `apps/api/src/stories/story-vocab.mapper.ts` | New: marks which timestamps correspond to vocab words |
| `apps/api/src/storage/storage.service.ts` | New: upload audio buffer to S3/local disk |
| `apps/api/src/stories/stories.service.ts` | Call `generateAndSave()` instead of seed |

### Acceptance criteria

- [ ] `POST /stories/generate` now returns a story with non-null `audioUrl`, correct `audioDurationMs`, and populated `wordTimestamps[]`
- [ ] `wordTimestamps[]` contains one entry per word in the story text, including punctuation-stripped forms
- [ ] For each timestamp where the word matches a vocab word from the collection, `isVocab: true` and `cardId` is populated
- [ ] Audio file is saved and accessible at the returned `audioUrl` (either local `/uploads/` or S3)
- [ ] `audioDurationMs` matches the actual audio file duration within ±500ms
- [ ] Vocab word matching is case-insensitive and strips German punctuation (`,.!?;:`)
- [ ] If TTS generation fails, the story is still saved with `audioUrl: null` and `audioDurationMs: 0` (text is not lost)
- [ ] If Whisper fails, the story is saved with `wordTimestamps: []` (audio is not lost)
- [ ] End-to-end generation + audio p95 time < 35 seconds
- [ ] Unit test: `StoryVocabMapper.markVocabWords()` with 3 timestamps and 2 matching vocab words correctly sets `isVocab: true` and `cardId` on matching entries

### Implementation notes

```typescript
// apps/api/src/stories/story-audio.service.ts
@Injectable()
export class StoryAudioService {
  constructor(
    private readonly openai: OpenAIAdapter,
    private readonly storage: StorageService,
    private readonly logger: Logger,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId: string,
  ): Promise<{ audioUrl: string; timestamps: WordTimestamp[]; durationMs: number }> {

    // Step 1: Generate TTS
    let speech: AISpeechResponse;
    try {
      speech = await this.openai.generateSpeech({ text: storyText, speed: 0.9 });
    } catch (err) {
      this.logger.error(`TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    // Step 2: Upload audio
    const audioUrl = await this.storage.upload(
      Buffer.from(speech.audioBuffer),
      `stories/${storyId}.mp3`,
      'audio/mpeg',
    );

    // Step 3: Transcribe with Whisper
    let rawTimestamps: WordTimestamp[];
    try {
      rawTimestamps = await this.openai.transcribeWithTimestamps(speech.audioBuffer);
    } catch (err) {
      this.logger.error(`Whisper failed for story ${storyId}`, err);
      return { audioUrl, timestamps: [], durationMs: speech.durationMs };
    }

    return { audioUrl, timestamps: rawTimestamps, durationMs: speech.durationMs };
  }
}
```

```typescript
// apps/api/src/stories/story-vocab.mapper.ts
@Injectable()
export class StoryVocabMapper {
  markVocabWords(timestamps: WordTimestamp[], vocabWords: StoryVocabWord[]): WordTimestamp[] {
    const lookup = new Map<string, string>(); // normalised word → cardId
    vocabWords.forEach(v => {
      lookup.set(this.normalise(v.germanBase), v.cardId);
      // Also map with article stripped
      lookup.set(this.normalise(v.german.replace(/^(der|die|das)\s+/i, '')), v.cardId);
    });

    return timestamps.map(ts => {
      const norm = this.normalise(ts.word);
      const cardId = lookup.get(norm);
      return cardId ? { ...ts, isVocab: true, cardId } : ts;
    });
  }

  private normalise(word: string): string {
    return word.toLowerCase().replace(/[,.!?;:"""''()]/g, '').trim();
  }
}
```

```typescript
// apps/api/src/stories/story-generation.service.ts — generateAndSave()
async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
  // 1. Fetch cards from requested collections
  const cards = await this.cardRepo.find({
    where: { userId, collectionId: In(dto.collectionIds) },
  });

  // 2. Generate story text
  const content = await this.generateText(dto, cards);

  // 3. Build full story text for TTS
  const fullText = content.sentences.map(s => s.german).join(' ');

  // 4. Map vocab words with card IDs
  const vocabWords = this.buildVocabWords(content, cards);

  // 5. Generate audio (non-blocking — story saves even if audio fails)
  const { audioUrl, timestamps, durationMs } = await this.audioService
    .generateAudioWithTimestamps(fullText, randomUUID());

  // 6. Mark vocab in timestamps
  const markedTimestamps = this.vocabMapper.markVocabWords(timestamps, vocabWords);

  // 7. Persist and return
  return this.storiesService.save({
    userId,
    ...content,
    sentences: content.sentences.map((s, i) => ({
      index: i,
      german: s.german,
      english: s.english,
      vocabWordIds: vocabWords
        .filter(v => v.sentenceIndices.includes(i))
        .map(v => v.cardId),
    })),
    wordTimestamps: markedTimestamps,
    vocabWords,
    audioUrl,
    audioDurationMs: durationMs,
    sourceCollectionIds: dto.collectionIds,
    difficultyLevel: dto.difficulty,
    lengthType: dto.length,
    listenCount: 0,
    lastListenedAt: null,
  });
}
```

### Storage service (local dev)

For local development, `StorageService` saves files to `apps/api/uploads/` and returns `http://localhost:3000/uploads/stories/{id}.mp3`. In production, it uploads to S3 and returns the S3 URL. This is toggled via `AI_STORAGE_BUCKET` env var — empty string means local disk.

---

---

## LC-055 · Wire real generation into StoriesService

**Epic:** 7 — AI Platform
**Phase:** 2 — Real generation
**Points:** 3
**Depends on:** LC-053, LC-054

### User story

As a developer, I want `StoriesService.generate()` to call the real generation pipeline instead of returning a seed story, so that the app actually uses AI in production.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/stories.service.ts` | Replace seed story block with `generateAndSave()` call |
| `apps/api/src/stories/stories.module.ts` | Inject all new services |

### Acceptance criteria

- [ ] `StoriesService.generate()` calls `StoryGenerationService.generateAndSave()` — not the seed object
- [ ] The seed story constant `SEED_STORY` is removed from `stories.service.ts`
- [ ] A `SEED_STORY` is moved to a new `apps/api/src/stories/seed/seed-story.ts` file and only used in a `POST /stories/seed` dev-only endpoint (guarded by `NODE_ENV !== 'production'`)
- [ ] Existing unit tests for `StoriesService` are updated to mock `StoryGenerationService`
- [ ] E2E test: `POST /stories/generate` with a valid `collectionIds` array returns a 201 with `bodyDe` containing German text, `vocabWords` array non-empty

---

---

## LC-056 · AI audio cache service (Angular)

**Epic:** 7 — AI Platform
**Phase:** 3 — Audio caching
**Points:** 5
**Depends on:** LC-055

### Context

Generated audio lives on the server. For offline-first behaviour, the Angular app must download audio files to local device storage (Capacitor Filesystem) after generation and serve them from disk on subsequent plays.

### User story

As a language learner, I want to listen to my stories even when I'm offline, so that I can keep learning during commutes or in areas with no internet connection.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/audio/ai-audio-cache.service.ts` | Core caching logic |
| `apps/mobile/src/app/features/ai/audio/voice-config.model.ts` | Voice configuration types |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/ai/ai.providers.ts` | Register `AiAudioCacheService` |

### Acceptance criteria

- [ ] `AiAudioCacheService.getOrDownload(storyId, audioUrl)` checks Capacitor Filesystem for `ai-audio/{storyId}.mp3` before making a network request
- [ ] On cache miss: downloads audio from `audioUrl`, saves to Capacitor Filesystem, returns local file URI
- [ ] On cache hit: returns local file URI immediately without any network call
- [ ] On download failure: returns the original `audioUrl` (remote URL fallback) and does NOT throw
- [ ] `AiAudioCacheService.evict(storyId)` deletes the cached file; called when `StoryStore.deleteStory()` runs
- [ ] `AiAudioCacheService.getCacheSize()` returns total bytes used by cached audio files
- [ ] Cached files survive app restart (Capacitor Filesystem persistent storage, not temp cache)
- [ ] Unit test: `getOrDownload()` with a cached file returns local URI without calling `HttpClient`
- [ ] Unit test: `getOrDownload()` without cache calls `HttpClient.get()` and saves result

### Implementation notes

```typescript
// features/ai/audio/ai-audio-cache.service.ts
@Injectable({ providedIn: 'root' })
export class AiAudioCacheService {
  private readonly CACHE_DIR = 'ai-audio';
  private readonly http = inject(HttpClient);

  async getOrDownload(storyId: string, remoteUrl: string | null): Promise<string | null> {
    if (!remoteUrl) return null;

    const filename = `${storyId}.mp3`;
    const path = `${this.CACHE_DIR}/${filename}`;

    try {
      // Check cache first
      const stat = await Filesystem.stat({ path, directory: Directory.Data });
      if (stat.size > 0) {
        // Already cached — return file URI
        const result = await Filesystem.getUri({ path, directory: Directory.Data });
        return Capacitor.convertFileSrc(result.uri);
      }
    } catch {
      // File does not exist yet — fall through to download
    }

    // Download
    try {
      await Filesystem.mkdir({
        path: this.CACHE_DIR,
        directory: Directory.Data,
        recursive: true,
      });

      await Filesystem.downloadFile({
        path,
        url: remoteUrl,
        directory: Directory.Data,
      });

      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio cache download failed for story ${storyId}:`, err);
      return remoteUrl; // Fallback to remote
    }
  }

  async evict(storyId: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${this.CACHE_DIR}/${storyId}.mp3`,
        directory: Directory.Data,
      });
    } catch {
      // File may not exist — ignore
    }
  }
}
```

---

---

## LC-057 · Offline story audio — download on first listen

**Epic:** 7 — AI Platform
**Phase:** 3 — Audio caching
**Points:** 3
**Depends on:** LC-056

### User story

As a language learner, I want the app to automatically cache story audio the first time I listen, so that I never have to manually download anything to use the app offline.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | Use `AiAudioCacheService` to resolve audio URL before loading |
| `apps/mobile/src/app/features/stories/store/story.store.ts` | Call `evict()` when `deleteStory()` runs |

### Acceptance criteria

- [ ] `StoryReaderPage.ngOnInit()` calls `AiAudioCacheService.getOrDownload()` and uses the returned URI (local or remote) for the `<audio>` element
- [ ] First play: audio is downloaded and cached; the player still starts within 2 seconds (download happens while the page loads)
- [ ] Second play (same session or new session): audio loads from cache, no network call
- [ ] When `StoryStore.deleteStory()` is called, `AiAudioCacheService.evict(id)` is called before the API delete
- [ ] If `audioUrl` is null (audio not yet generated), reader shows a "Audio not available" state and disables play button rather than crashing
- [ ] Loading indicator shown while `getOrDownload()` is resolving

### Implementation notes

```typescript
// story-reader.page.ts — modified ngOnInit
async ngOnInit(): Promise<void> {
  const id = this.route.snapshot.paramMap.get('id') ?? '';
  let story = this.storyStore.getById(id);

  if (!story) {
    try {
      story = await firstValueFrom(this.api.getById(id));
    } catch {
      this.router.navigate(['/stories']);
      return;
    }
  }

  // Resolve audio to local cache or remote fallback
  this.audioLoading.set(true);
  const resolvedUrl = await this.aiAudioCache.getOrDownload(story.id, story.audioUrl);
  this.audioLoading.set(false);

  this.story.set({ ...story, audioUrl: resolvedUrl });

  if (resolvedUrl) {
    this.initAudio(resolvedUrl);
  }
}
```

---

---

## LC-058 · Word pronunciation via AI (vault + review)

**Epic:** 7 — AI Platform
**Phase:** 4 — Pronunciation
**Points:** 5
**Depends on:** LC-056

### Context

`word-detail.component.ts` currently calls `AudioService.speak()` which uses Web Speech API (browser TTS). This replaces that with AI-generated pronunciation audio that is cached per card, giving consistent high-quality audio across devices.

### User story

As a language learner, I want to hear a consistent, natural pronunciation of each German word, so that I learn correct pronunciation regardless of which device or browser I'm using.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/pages/word-detail/word-detail.component.ts` | Use `PronunciationService` instead of `AudioService.speak()` directly |
| `apps/mobile/src/app/features/ai/audio/pronunciation.service.ts` | New: wraps `AiOrchestrationService.generatePronunciation()` + cache |
| `apps/mobile/src/app/features/review/review.page.ts` | Use `PronunciationService` for auto-play during review |

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/audio/pronunciation.service.ts` | AI pronunciation with cache |

### Acceptance criteria

- [ ] `PronunciationService.play(card)` generates or retrieves pronunciation audio for a card and plays it
- [ ] On first call for a given `cardId`: API generates audio, saved to `ai-pronunciation/{cardId}.mp3` via `AiAudioCacheService`
- [ ] On subsequent calls: cached file is played immediately (no API call)
- [ ] `word-detail.component.ts` `playPronunciation()` calls `PronunciationService.play(card)` instead of `AudioService.speak()`
- [ ] If AI pronunciation generation fails, graceful fallback to `AudioService.speak()` (Web Speech)
- [ ] `isLoading` signal on `PronunciationService` to show spinner during first generation
- [ ] Unit test: second call to `play()` for same card does not call `AiOrchestrationService`

### Implementation notes

```typescript
// features/ai/audio/pronunciation.service.ts
@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly ai = inject(AiOrchestrationService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService); // Web Speech fallback

  readonly isLoading = signal(false);

  async play(card: Card): Promise<void> {
    const cacheKey = `pronunciation-${card.id}`;
    const remoteKey = `pronunciation/${card.id}.mp3`;

    // Try to get from cache
    let audioUrl = await this.cache.getFromCache(cacheKey);

    if (!audioUrl) {
      this.isLoading.set(true);
      try {
        const speech = await this.ai.generatePronunciation({
          cardId: card.id,
          word: card.content.back,
          language: 'de-DE',
        });

        audioUrl = await this.cache.saveBuffer(cacheKey, speech.audioBuffer);
      } catch {
        // Fallback to Web Speech
        this.isLoading.set(false);
        this.fallback.speak(card.content.back, 'de-DE', 0.85).subscribe();
        return;
      }
      this.isLoading.set(false);
    }

    const audio = new Audio(audioUrl);
    audio.play();
  }
}
```

---

---

## LC-059 · Extended story lengths (very-long, extra-long)

**Epic:** 7 — AI Platform
**Phase:** 5 — Length variants
**Points:** 3
**Depends on:** LC-061, LC-055

### User story

As a language learner, I want to generate longer, more immersive stories — including podcast-length narratives — so that I can practise sustained reading and listening in German.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.ts` | Add Very Long and Extra Long chips |
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.html` | Render new chip options |
| `apps/api/src/stories/story.entity.ts` | Ensure `lengthType` column accepts new values |

### Acceptance criteria

- [ ] Generate sheet shows 5 length chips: Short / Medium / Long / Very Long / Extra Long
- [ ] Extra Long chip has a subtitle or badge: "Podcast-style"
- [ ] `GenerateStoryDto.length` correctly sends `'very-long'` or `'extra-long'` to the API
- [ ] API `StoryEntity.lengthType` column is `varchar` not enum (to avoid migration pain with new values)
- [ ] `'very-long'` generates ~800-word stories; `'extra-long'` generates ~1200-word stories
- [ ] Generation time warning shown for very-long and extra-long: "This may take up to 45 seconds"
- [ ] All existing short/medium/long chip tests still pass

### Implementation notes

```typescript
// generate-story-sheet.component.ts
readonly lengths: Array<{ value: StoryLength; label: string; badge?: string }> = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
  { value: 'very-long', label: 'Very Long' },
  { value: 'extra-long', label: 'Extra Long', badge: 'Podcast' },
];

readonly isLongFormat = computed(() =>
  this.length() === 'very-long' || this.length() === 'extra-long'
);
```

---

---

## LC-060 · Prompt engineering for extra-long / podcast format

**Epic:** 7 — AI Platform
**Phase:** 5 — Length variants
**Points:** 3
**Depends on:** LC-059, LC-053

### User story

As a language learner, I want extra-long stories to feel like a narrated learning podcast with natural pauses, scene transitions, and a host-style narrative voice, so that the extended format is engaging rather than just a longer version of a short story.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-prompt.builder.ts` | Add `extra-long` format-specific prompt variant |

### Acceptance criteria

- [ ] `extra-long` prompt instructs the model to write in a podcast/audiobook style with: a brief scene-setting introduction, 2–3 scene transitions, natural spoken-style sentences, and a concluding reflection
- [ ] `very-long` prompt extends the standard narrative prompt without the podcast-style framing
- [ ] Generated extra-long story output has `sentences[]` count between 45–70
- [ ] `bodyDe` word count is 1100–1500 for extra-long
- [ ] Manual QA: read an extra-long story aloud — it should flow naturally as speech, not as written text

### Implementation notes

```typescript
// story-prompt.builder.ts — extra-long format
private buildExtraLongPrompt(vocabList: string, cefrDesc: string): string {
  return `You are writing a German learning podcast episode for an adult learner.

FORMAT: Write a 1100–1400 word German podcast-style narrative with:
- A brief introduction paragraph that sets the scene and welcomes the listener
- 2–3 scene transitions (marked with "— Szene 2 —" style headings)
- Natural spoken German — use contractions, ellipses, and conversational phrases where appropriate
- A concluding reflection paragraph that references the vocabulary themes
- Dialogue in direct speech throughout

VOCABULARY (use ≥70%):
${vocabList}

LEVEL: ${cefrDesc}

OUTPUT — valid JSON only:
{
  "title": "Podcast episode title in German",
  "titleTranslation": "English translation",
  "sentences": [
    { "german": "...", "english": "...", "vocabWordsUsed": [] }
  ]
}`;
}
```

---

---

## LC-063 · Story sync handler (offline → server)

**Epic:** 7 — AI Platform
**Phase:** 8 — Sync
**Points:** 3
**Depends on:** LC-055

### Context

When a story is generated offline (network failure mid-generation) or the server save fails, a `SyncOperation<GenerateStoryDto>` should be queued. When online again, `SyncService` retries through the `StorySyncHandler`.

### User story

As a language learner, I want story generation to queue for retry if my connection drops mid-generation, so that I don't lose my generation request.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/stories/services/story-sync.handler.ts` | SyncHandler implementation |

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/store/story.store.ts` | On `generateStory()` failure, enqueue `SyncOperation` |
| `apps/mobile/src/app/features/stories/stories.providers.ts` | Register `StorySyncHandler` with `SyncService` |

### Acceptance criteria

- [ ] `StorySyncHandler` implements `SyncHandler` from `core/sync/`
- [ ] `StorySyncHandler.type` is `'GENERATE_STORY'`
- [ ] When `StoryStore.generateStory()` fails with a network error, a `SyncOperation<GenerateStoryDto>` is enqueued via `SyncService`
- [ ] When the device comes back online, `SyncService` calls `StorySyncHandler.execute()`, which retries `StoryApiService.generate()`
- [ ] On retry success: story is added to the store as if it had succeeded originally
- [ ] On retry failure (non-network error, e.g. 422): the operation is removed from the queue and an error notification is shown
- [ ] `core/sync/sync.service.ts` does not import any type from `features/stories/`

---

---

## LC-065 · Generation loading UX (streaming progress)

**Epic:** 7 — AI Platform
**Phase:** 10 — Polish
**Points:** 3
**Depends on:** LC-055

### Context

Generation takes 10–35 seconds. The current sheet shows a spinner and "Generating your story…" text but gives no indication of progress. This story adds step-based progress messaging to reduce perceived wait time.

### User story

As a language learner, I want to see step-by-step progress while my story is generating, so that I know the app is working and approximately how long it will take.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.ts` | Add generation step signals |
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.html` | Render step progress |
| `apps/api/src/stories/stories.controller.ts` | Add SSE streaming endpoint for generation progress |

### Acceptance criteria

- [ ] While generating, the sheet shows sequential status messages with smooth fade transitions:
  1. "Writing your story…" (shown immediately on generate tap)
  2. "Narrating the audio…" (shown after ~8 seconds or when text is ready)
  3. "Almost ready…" (shown after ~20 seconds or when audio is ready)
- [ ] Each message has a subtle animated indicator (pulsing dot or progress bar)
- [ ] Estimated wait is shown under the status: "Usually 10–20 seconds" for short/medium, "Usually 25–40 seconds" for very-long/extra-long
- [ ] Sheet cannot be dismissed during generation (backdrop tap does nothing)
- [ ] If generation takes >45 seconds, a message appears: "This is taking longer than usual — please wait"
- [ ] On completion, sheet closes with a success micro-animation before the library updates

### Implementation notes

The step transitions are time-based on the Angular side (no need for SSE for MVP):

```typescript
// generate-story-sheet.component.ts
readonly generationStep = signal<0 | 1 | 2 | 3>(0);

private startStepTimer(): void {
  setTimeout(() => { if (this.generating()) this.generationStep.set(1); }, 1000);
  setTimeout(() => { if (this.generating()) this.generationStep.set(2); }, 10000);
  setTimeout(() => { if (this.generating()) this.generationStep.set(3); }, 22000);
}

readonly stepMessage = computed(() => [
  '',
  'Writing your story…',
  'Narrating the audio…',
  'Almost ready…',
][this.generationStep()]);
```

---

---

## LC-066 · Error handling & retry UI

**Epic:** 7 — AI Platform
**Phase:** 10 — Polish
**Points:** 2
**Depends on:** LC-065

### User story

As a language learner, I want clear, actionable error messages when story generation fails, so that I know whether to retry or check my connection.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.ts` | Classify errors, expose typed error signal |
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.html` | Render error with retry button |
| `apps/api/src/stories/story-generation.service.ts` | Return structured error codes |

### Acceptance criteria

- [ ] Network error (no internet): "No internet connection. Check your connection and try again." with Retry button
- [ ] Server timeout (>45s): "Story generation timed out. Try a shorter length or try again later." with Retry button
- [ ] AI provider error (500 from API): "Our AI service is having trouble right now. Please try again in a moment." with Retry button
- [ ] Retry button re-runs the generation without closing/reopening the sheet
- [ ] After 3 consecutive failures, a "Contact support" link appears alongside the retry button
- [ ] Errors are logged to the console with the full error object for debugging

---

---

## LC-062 · Fix story.store.ts import path

**Epic:** 7 — AI Platform
**Phase:** Housekeeping (do alongside LC-061)
**Points:** 1

### User story

As a developer, I want `story.store.ts` to import from `@lingua-card/shared/domain` consistently with every other file that uses shared types, so that there is no hidden dependency on the re-export barrel.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/store/story.store.ts` | Fix one import line |

### Acceptance criteria

- [ ] Line `import { GenerateStoryDto, Story } from '../../../core/models/mock-data';` changed to `import { GenerateStoryDto, Story } from '@lingua-card/shared/domain';`
- [ ] `tsc --noEmit` passes with no new errors
- [ ] No functional behaviour changes

---

---

## LC-067 · Pronunciation cache & reuse across features

**Epic:** 7 — AI Platform
**Phase:** 11 — Future hooks
**Points:** 3
**Depends on:** LC-058

### User story

As a language learner, I want pronunciation audio I've heard in the vault to play instantly in the review and story reader screens too, so that I never wait for the same word to be generated twice.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/review/review.page.ts` | Inject `PronunciationService` for auto-play of the current card's word |
| `apps/mobile/src/app/features/ai/audio/ai-audio-cache.service.ts` | Ensure `getFromCache()` works with the pronunciation key format |

### Acceptance criteria

- [ ] `PronunciationService` has a shared cache keyed by `cardId` — cache written in vault is readable in review and vice versa
- [ ] Review auto-play feature (if enabled in settings) uses `PronunciationService.play()` when flipping a card
- [ ] Story reader tapping a vocab word chip calls `PronunciationService.play()` for that card
- [ ] Cache file is the same physical file regardless of which screen first generated it
- [ ] Unit test: `PronunciationService.play()` called from two different injection contexts uses the same cached file

---

---

## LC-068 · AI usage tracking service

**Epic:** 7 — AI Platform
**Phase:** 11 — Future hooks
**Points:** 2
**Depends on:** LC-052

### Context

Needed for cost monitoring and future rate limiting. Tracks tokens used per request and per user. Does not require a UI in this story — just the service and storage.

### User story

As a developer, I want to track AI API usage (tokens, provider, cost estimate) per user and per request type, so that I can monitor costs and implement usage limits in the future.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/ai/orchestration/ai-usage-tracker.service.ts` | Client-side usage recording |
| `apps/api/src/ai/usage/ai-usage.entity.ts` | NestJS usage record entity |
| `apps/api/src/ai/usage/ai-usage.service.ts` | Persist and query usage |

### Acceptance criteria

- [ ] Every call through `AiOrchestrationService` records `{ userId, provider, model, inputTokens, outputTokens, requestType, timestamp }` via the API
- [ ] Recording is fire-and-forget — a tracking failure never affects the main generation flow
- [ ] `GET /ai/usage/summary` returns total tokens used in the current month for the authenticated user
- [ ] NestJS `AiUsageEntity` has correct indexes on `userId` and `timestamp`
- [ ] No usage data contains story content or vocabulary — only token counts and request types

---

## Implementation order summary

Work through these in exactly this sequence to avoid blocked dependencies:

1. **LC-061** — Fix shared types (all other stories need correct `StoryLength`)
2. **LC-062** — Fix import path (quick win, do alongside LC-061)
3. **LC-064** — Environment config (needed before any adapter work)
4. **LC-050** — AI provider interface + Anthropic adapter
5. **LC-051** — OpenAI adapter
6. **LC-052** — AI orchestration service
7. **LC-053** — Real story text generation (NestJS)
8. **LC-054** — Story audio + timestamps (NestJS) — longest story, plan 2 days
9. **LC-055** — Wire generation into StoriesService
10. **LC-056** — AI audio cache service (Angular)
11. **LC-057** — Offline audio download on first listen
12. **LC-058** — Word pronunciation
13. **LC-059** — Extended length chips UI
14. **LC-060** — Podcast prompt engineering
15. **LC-063** — Story sync handler
16. **LC-065** — Generation loading UX
17. **LC-066** — Error handling
18. **LC-067** — Cross-feature pronunciation cache
19. **LC-068** — Usage tracking
20. **LC-069** — Gemini TTS adapter (NestJS)
21. **LC-070** — Gemini TTS adapter (Angular)
22. **LC-071** — Wire Gemini TTS into audio pipeline

---

## LC-069 · Gemini TTS adapter — NestJS

**Epic:** 7 — AI Platform
**Phase:** 12 — Gemini TTS
**Points:** 3
**Depends on:** LC-064

### What was implemented

Added `generateSpeech()` to the NestJS `GeminiAdapter` (`apps/api/src/ai/providers/gemini.adapter.ts`).

Uses `gemini-2.5-flash-preview-tts` model with `responseModalities: [Modality.AUDIO]` and `speechConfig` for language + voice selection. Returns `{ audioBuffer, durationMs, mimeType }` where `mimeType` is `audio/wav` or `audio/pcm` from the Gemini response.

Added `POST /ai/tts` endpoint (`apps/api/src/ai/ai.controller.ts`) that accepts `{ text, voice?, language? }` and returns the raw audio bytes with correct `Content-Type`. Endpoint is JWT-protected. `AiModule` registered in `AppModule`.

**Default voice:** `Kore` (neutral, suitable for German narration).
**Default language:** `de-DE`.

---

## LC-070 · Gemini TTS adapter — Angular

**Epic:** 7 — AI Platform
**Phase:** 12 — Gemini TTS
**Points:** 2
**Depends on:** LC-069

### What was implemented

Created `apps/mobile/src/app/features/ai/providers/gemini.adapter.ts` — an Angular service that `POST`s to `${apiUrl}/ai/tts` and returns the audio blob as an `ArrayBuffer` matching the `AISpeechResponse` interface.

`GeminiAdapter` implements `AIProvider` (throws on `generateText` and `transcribeWithTimestamps` since those are not Gemini's responsibility on the Angular side).

Registered in `ai.providers.ts` (`provideAi()`), exported from `providers/index.ts` and `features/ai/index.ts`. `AiProviderFactory` updated to handle `'gemini'` case.

---

## LC-071 · Wire Gemini TTS into story audio pipeline and pronunciation

**Epic:** 7 — AI Platform
**Phase:** 12 — Gemini TTS
**Points:** 3
**Depends on:** LC-069, LC-070

### What was implemented

**NestJS** — `StoryAudioService` now calls `GeminiAdapter.generateSpeech()` instead of `OpenAIAdapter.generateSpeech()` for story narration. `OpenAIAdapter.transcribeWithTimestamps()` remains in use for Whisper word-level timestamps (Gemini has no equivalent). File extension and `Content-Type` are now dynamic based on the returned `mimeType`.

**Angular** — `AiOrchestrationService` updated: `generateSpeechWithTimestamps()` routes audio generation to `GeminiAdapter`, timestamp transcription remains with `OpenAIAdapter`. `generatePronunciation()` now calls `GeminiAdapter.generateSpeech()` — all card pronunciation in vault and review uses Gemini TTS.

### Key files changed

| File | Change |
|------|--------|
| `apps/api/src/ai/providers/gemini.adapter.ts` | Added `generateSpeech()` |
| `apps/api/src/ai/ai.controller.ts` | New — `POST /ai/tts` endpoint |
| `apps/api/src/ai/ai.module.ts` | Added `AiController` |
| `apps/api/src/app.module.ts` | Registered `AiModule` |
| `apps/api/src/stories/story-audio.service.ts` | Routes TTS to Gemini; Whisper stays for timestamps |
| `apps/api/src/ai/providers/openai.adapter.ts` | `transcribeWithTimestamps` accepts `mimeType` param |
| `apps/mobile/src/app/features/ai/providers/gemini.adapter.ts` | New Angular adapter |
| `apps/mobile/src/app/features/ai/orchestration/ai-orchestration.service.ts` | Routes speech to Gemini |
| `apps/mobile/src/app/features/ai/ai.providers.ts` | Registers `GeminiAdapter` |
| `apps/mobile/src/app/features/ai/providers/ai-provider.factory.ts` | Handles `'gemini'` case |
| `apps/mobile/src/app/features/ai/providers/index.ts` | Exports `GeminiAdapter` |
| `apps/mobile/src/app/features/ai/index.ts` | Exports `GeminiAdapter` |

---

## Non-goals for this epic

- User editing of AI-generated story text
- Multi-voice or character-specific voice selection
- Story sharing between users
- Grammar annotation or hover-over grammar explanations (planned for Epic 8)
- Conversation mode / AI tutor chat (planned for Epic 9)
- AI-generated flashcard suggestions from story content (planned for Epic 9)
- Speech recognition / pronunciation feedback (planned for Epic 10)
- Adaptive difficulty auto-detection from SRS mastery level (planned for Epic 9)