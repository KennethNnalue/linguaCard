# Story Studio Redesign — Epic

## Epic: Story Studio 2.0 — Explore, Read, Interact

> **Scope:** Full redesign of the Story Studio page, introduction of platform-curated stories alongside user-generated stories, redesigned story reader with interactive word-tap, floating audio controls, and refined quiz experience.
>
> **Prerequisites:** Story Reader Redesign (LC-R01–R13) complete. Subscription & Paywall (LC-103–118) implemented. Stories feature scaffold fully operational.
>
> **Ticket numbering:** LC-300 through LC-345 (continuing from the LC-200 series used by Listen & Learn rebuild).

---

## UX/UI Research Summary

### Competitive Analysis

| App | Key Feature | What LinguaCard Should Adopt |
|---|---|---|
| **Langster / Readle** | CEFR-graded stories, tap-to-translate, grammar-in-context, keywords tab, quiz per story | Category system (level + topic), tap-on-word instant dictionary pattern |
| **Beelinguapp** | Parallel bilingual text, karaoke scrolling, genre categories (fairy tales, news, culture, science) | Genre/category taxonomy, side-by-side reading mode |
| **StoryZone** | 100+ stories across 8 categories, tap-to-translate popup, save vocabulary, post-story quizzes | Category-based discovery, personal vocabulary save from reader |
| **LingQ** | Import-anything philosophy, known-word tracking, blue/yellow word highlighting by familiarity | Word familiarity signaling (known vs. new words) |
| **Eppika** | Adapted real bestsellers at CEFR levels, A1–C1 graded content | Professional content quality, fiction integration |
| **Duolingo Stories** | Gamified narrative scenarios, character-driven, comprehension checkpoints mid-story | Engagement hooks, mid-story quizzes |

### Key Design Principles Derived

1. **Discovery-first architecture:** The Story Studio should lead with exploration and browsing, not just a "generate" CTA. Users need curated content to build a reading habit before they generate custom stories.
2. **Tap-on-word is table stakes:** Every major reading-based language app (Langster, Beelinguapp, StoryZone, LingQ) supports tapping a word to see its translation, pronunciation, and grammar info. This is the single highest-value interaction pattern.
3. **Category taxonomy drives engagement:** Beelinguapp and Langster both see higher retention when users can filter by personal interests (travel, food, tech, sports) rather than only by difficulty level.
4. **Floating controls preserve immersion:** Audio player controls should float as a pill at the bottom of the reading surface, not break the scroll flow. Spotify's mini-player pattern is the proven UX.
5. **Quiz depth scales with content:** Fixed quiz counts (e.g., always 4) feel arbitrary. Scaling with story length (min 5, +1 per ~3 sentences) produces more proportional assessment.
6. **"Pause on mistakes" is the default:** Pedagogically, forcing learners to see the correct answer before advancing produces better retention than auto-advance. Default ON.

---

## Story Map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| **0 — Domain & Types** | LC-300 | Extend domain types: `PlatformStory`, `StoryCategory`, `StoryTopic` | 3 |
| **0 — Domain & Types** | LC-301 | Extend `StoryQuizQuestion` with dynamic count logic type | 1 |
| **1 — Backend: Platform Stories** | LC-302 | `PlatformStoryEntity` + database migration | 3 |
| **1 — Backend: Platform Stories** | LC-303 | `PlatformStoriesService`: CRUD + seed pipeline | 5 |
| **1 — Backend: Platform Stories** | LC-304 | `GET /platform-stories` — list with filters (level, category, topic) | 3 |
| **1 — Backend: Platform Stories** | LC-305 | `GET /platform-stories/:id` — full story with quiz, keywords, grammar | 2 |
| **1 — Backend: Platform Stories** | LC-306 | Seed 20 platform stories across levels and categories | 5 |
| **2 — Backend: Quiz Scaling** | LC-307 | Dynamic quiz count: `max(5, ceil(sentences.length / 3))` in generation | 2 |
| **2 — Backend: Quiz Scaling** | LC-308 | Backfill existing stories with additional quiz questions if under minimum | 3 |
| **3 — Frontend: Story Studio Redesign** | LC-310 | Story Studio page — two-section layout (Explore + My Stories) | 5 |
| **3 — Frontend: Story Studio Redesign** | LC-311 | Explore section — horizontal category filter chips | 3 |
| **3 — Frontend: Story Studio Redesign** | LC-312 | Explore section — story browse cards (cover image, level badge, title, topic tag) | 3 |
| **3 — Frontend: Story Studio Redesign** | LC-313 | "See All" category drill-down page | 3 |
| **3 — Frontend: Story Studio Redesign** | LC-314 | My Stories section — refined story card design | 3 |
| **3 — Frontend: Story Studio Redesign** | LC-315 | Platform story detail — reuse existing reader with `isPlatform` flag | 2 |
| **4 — Frontend: Story Reader Refinements** | LC-320 | Floating audio player pill (replaces fixed bottom bar) | 3 |
| **4 — Frontend: Story Reader Refinements** | LC-321 | Tap-on-word: active word highlight state | 3 |
| **4 — Frontend: Story Reader Refinements** | LC-322 | Active word cover panel — word, plural, article, translation | 5 |
| **4 — Frontend: Story Reader Refinements** | LC-323 | Active word — conjugate button (verbs only) | 3 |
| **4 — Frontend: Story Reader Refinements** | LC-324 | Active word — audio play button in cover | 2 |
| **4 — Frontend: Story Reader Refinements** | LC-325 | Active word — "Add to collection" action with duplicate detection | 3 |
| **4 — Frontend: Story Reader Refinements** | LC-326 | Scrollable story text with sticky tab bar and floating controls | 2 |
| **5 — Quiz Refinements** | LC-330 | Rename "Manual advance on wrong" → "Pause on mistakes", default ON | 1 |
| **5 — Quiz Refinements** | LC-331 | Dynamic quiz question count UI (progress ring reflects actual count) | 2 |
| **5 — Quiz Refinements** | LC-332 | Quiz — sentence audio auto-play on question load | 2 |
| **6 — Platform Story Content Pipeline** | LC-340 | Admin: AI batch-generate platform stories from topic+level matrix | 5 |
| **6 — Platform Story Content Pipeline** | LC-341 | Platform story cover image generation (AI or stock) | 3 |
| **6 — Platform Story Content Pipeline** | LC-342 | Platform story audio generation (full narration) | 3 |
| **7 — Polish & Analytics** | LC-343 | Story engagement analytics (reads, quiz completion, time spent) | 2 |
| **7 — Polish & Analytics** | LC-344 | Empty state for Explore section (no stories loaded yet) | 1 |
| **7 — Polish & Analytics** | LC-345 | CLAUDE.md update: add Epic 14 to status table | 1 |

**Total: ~88 story points across 31 tickets**

---

## Category Taxonomy

### CEFR Levels (primary filter)

| Level | Label | Description |
|---|---|---|
| A1 | Beginner | Simple sentences, basic vocabulary, present tense |
| A2 | Elementary | Everyday situations, past tense, simple connectors |
| B1 | Intermediate | Express opinions, hypotheticals, subordinate clauses |
| B2 | Upper Intermediate | Complex arguments, passive voice, nuanced vocabulary |

### Topics (secondary filter)

| Category | Example Topics |
|---|---|
| **Daily Life** | Morning routines, shopping, cooking, moving house, roommates |
| **Travel** | Airport, hotel, train travel, asking for directions, city guides |
| **Food & Culture** | Restaurant ordering, regional cuisine, festivals, traditions |
| **Work & Career** | Job interviews, office life, emails, presentations, networking |
| **Technology** | Apps, social media, gadgets, digital life, online shopping |
| **Health & Fitness** | Doctor visits, gym, nutrition, mental health, sports |
| **Education** | University, exams, studying abroad, language exchange |
| **Nature & Environment** | Weather, hiking, animals, sustainability, seasons |
| **Entertainment** | Movies, music, hobbies, weekend plans, events |
| **Fiction** | Mystery, romance, adventure, science fiction, fairy tales |

### Story Metadata

Every platform story carries:

```typescript
interface PlatformStoryMeta {
  level: 'A1' | 'A2' | 'B1' | 'B2';
  category: StoryCategory;        // 'daily-life' | 'travel' | 'food-culture' | etc.
  topics: string[];                // ['restaurant', 'ordering', 'tip']
  estimatedReadMinutes: number;
  wordCount: number;
  isFiction: boolean;
  coverImageUrl: string;
  isPremium: boolean;              // Pro-only stories
}
```

---

## Detailed User Stories

---

### LC-300 · Extend domain types — PlatformStory, StoryCategory, StoryTopic

**Epic:** Story Studio 2.0
**Phase:** 0 — Domain & Types
**Points:** 3
**Depends on:** nothing (do first)

#### User story

As a developer, I want shared domain types for platform stories, story categories, and story topics, so that both the backend API and the mobile app have a stable data contract for the Explore feature.

#### New types in `libs/shared/domain/src/index.ts`

```typescript
// ─── STORY STUDIO 2.0: PLATFORM STORIES ──────────────────────────────────────

export type StoryCategory =
  | 'daily-life'
  | 'travel'
  | 'food-culture'
  | 'work-career'
  | 'technology'
  | 'health-fitness'
  | 'education'
  | 'nature-environment'
  | 'entertainment'
  | 'fiction';

export const STORY_CATEGORIES: { value: StoryCategory; label: string; icon: string }[] = [
  { value: 'daily-life', label: 'Daily Life', icon: '🏠' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
  { value: 'food-culture', label: 'Food & Culture', icon: '🍽️' },
  { value: 'work-career', label: 'Work & Career', icon: '💼' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'health-fitness', label: 'Health & Fitness', icon: '🏃' },
  { value: 'education', label: 'Education', icon: '📚' },
  { value: 'nature-environment', label: 'Nature', icon: '🌿' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'fiction', label: 'Fiction', icon: '📖' },
];

export interface PlatformStory {
  id: string;
  title: string;
  titleTranslation: string;
  bodyDe: string;
  bodyEn: string;
  sentences: StorySentence[];
  wordTimestamps: WordTimestamp[];
  keywords: StoryKeyword[];
  quizQuestions: StoryQuizQuestion[];
  grammarNotes: StoryGrammarNote[];
  audioUrl: string | null;
  audioDurationMs: number;
  coverImageUrl: string;
  level: StoryDifficulty;
  category: StoryCategory;
  topics: string[];
  isFiction: boolean;
  isPremium: boolean;
  wordCount: number;
  estimatedReadMinutes: number;
  publishedAt: string;
  readCount: number;        // global read count (all users)
}

/** Lightweight card for browse/list views — no body text or full data */
export interface PlatformStoryCard {
  id: string;
  title: string;
  titleTranslation: string;
  coverImageUrl: string;
  level: StoryDifficulty;
  category: StoryCategory;
  topics: string[];
  isFiction: boolean;
  isPremium: boolean;
  wordCount: number;
  estimatedReadMinutes: number;
  keywordCount: number;
  quizCount: number;
}

/** User's reading progress on a platform story */
export interface UserStoryProgress {
  storyId: string;
  userId: string;
  isRead: boolean;
  quizScore: number | null;     // percentage 0-100
  lastReadAt: string | null;
  savedWordIds: string[];       // words added to vault from this story
}
```

#### Acceptance criteria

- [ ] All new types exported from `libs/shared/domain/src/index.ts`
- [ ] `StoryCategory` type and `STORY_CATEGORIES` constant are exported
- [ ] `PlatformStory` includes all fields matching the backend entity (LC-302)
- [ ] `PlatformStoryCard` is a lightweight projection for list views
- [ ] `UserStoryProgress` tracks per-user reading state
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`

---

### LC-301 · Extend StoryQuizQuestion with dynamic count logic type

**Epic:** Story Studio 2.0
**Phase:** 0 — Domain & Types
**Points:** 1
**Depends on:** LC-300

#### User story

As a developer, I want a shared utility function that calculates the correct quiz count based on story length, so that both backend generation and frontend progress display use the same formula.

#### Implementation

```typescript
// libs/shared/domain/src/index.ts

/**
 * Calculate quiz question count based on story sentence count.
 * Minimum 5 for short stories, scales up for longer ones.
 * Formula: max(5, ceil(sentenceCount / 3))
 */
export function calculateQuizCount(sentenceCount: number): number {
  return Math.max(5, Math.ceil(sentenceCount / 3));
}
```

#### Acceptance criteria

- [ ] `calculateQuizCount(3)` returns `5` (minimum)
- [ ] `calculateQuizCount(15)` returns `5`
- [ ] `calculateQuizCount(18)` returns `6`
- [ ] `calculateQuizCount(30)` returns `10`
- [ ] Function exported from shared domain barrel

---

### LC-302 · PlatformStoryEntity + database migration

**Epic:** Story Studio 2.0
**Phase:** 1 — Backend: Platform Stories
**Points:** 3
**Depends on:** LC-300

#### User story

As a developer, I want a `platform_stories` database table with all required columns, so that platform-curated stories can be persisted independently from user-generated stories.

#### Entity design

```typescript
// apps/api/src/platform-stories/platform-story.entity.ts
@Entity('platform_stories')
export class PlatformStoryEntity {
  @PrimaryColumn() id!: string;
  @Column() title!: string;
  @Column({ default: '' }) titleTranslation!: string;
  @Column('text') bodyDe!: string;
  @Column('text') bodyEn!: string;
  @Column('jsonb', { default: [] }) sentences!: StorySentence[];
  @Column('jsonb', { default: [] }) wordTimestamps!: WordTimestamp[];
  @Column('jsonb', { default: [] }) keywords!: StoryKeyword[];
  @Column('jsonb', { default: [] }) quizQuestions!: StoryQuizQuestion[];
  @Column('jsonb', { default: [] }) grammarNotes!: StoryGrammarNote[];
  @Column({ nullable: true, type: 'varchar' }) audioUrl!: string | null;
  @Column({ default: 0 }) audioDurationMs!: number;
  @Column({ nullable: true, type: 'varchar' }) coverImageUrl!: string | null;
  @Column() level!: StoryDifficulty;
  @Column() category!: StoryCategory;
  @Column('text', { array: true, default: [] }) topics!: string[];
  @Column({ default: false }) isFiction!: boolean;
  @Column({ default: false }) isPremium!: boolean;
  @Column({ default: 0 }) wordCount!: number;
  @Column({ default: 0 }) estimatedReadMinutes!: number;
  @Column({ default: 0 }) readCount!: number;
  @Column({ default: true }) isPublished!: boolean;
  @CreateDateColumn() publishedAt!: Date;
}
```

#### Additional entity: `UserStoryProgressEntity`

```typescript
@Entity('user_story_progress')
@Unique(['userId', 'storyId'])
export class UserStoryProgressEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() userId!: string;
  @Column() storyId!: string;
  @Column({ default: false }) isRead!: boolean;
  @Column({ nullable: true, type: 'int' }) quizScore!: number | null;
  @Column({ nullable: true, type: 'varchar' }) lastReadAt!: string | null;
  @Column('text', { array: true, default: [] }) savedWordIds!: string[];
}
```

#### Acceptance criteria

- [ ] `platform_stories` table created with TypeORM migration
- [ ] `user_story_progress` table created with composite unique constraint on `(userId, storyId)`
- [ ] All columns match the domain types from LC-300
- [ ] Index on `level` and `category` columns for filtered queries
- [ ] Migration is reversible (down method drops both tables)

---

### LC-303 · PlatformStoriesService: CRUD + seed pipeline

**Epic:** Story Studio 2.0
**Phase:** 1 — Backend: Platform Stories
**Points:** 5
**Depends on:** LC-302

#### User story

As a developer, I want a `PlatformStoriesService` that handles listing, filtering, and retrieving platform stories, so that the API endpoints can delegate to a clean service layer.

#### Service API

```typescript
@Injectable()
export class PlatformStoriesService {
  constructor(
    @InjectRepository(PlatformStoryEntity) private repo: Repository<PlatformStoryEntity>,
    @InjectRepository(UserStoryProgressEntity) private progressRepo: Repository<UserStoryProgressEntity>,
  ) {}

  async findAll(filters: {
    level?: StoryDifficulty;
    category?: StoryCategory;
    isFiction?: boolean;
    isPremium?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PlatformStoryCard[]> { ... }

  async findById(id: string): Promise<PlatformStory | null> { ... }

  async getUserProgress(userId: string, storyId: string): Promise<UserStoryProgress | null> { ... }

  async markAsRead(userId: string, storyId: string): Promise<void> { ... }

  async saveQuizScore(userId: string, storyId: string, score: number): Promise<void> { ... }

  async addSavedWord(userId: string, storyId: string, wordId: string): Promise<void> { ... }

  async incrementReadCount(storyId: string): Promise<void> { ... }
}
```

#### Acceptance criteria

- [ ] `findAll()` returns `PlatformStoryCard[]` (lightweight projection — no body/sentences)
- [ ] Filters work: level, category, isFiction, isPremium
- [ ] Only `isPublished: true` stories are returned
- [ ] `findById()` returns the full `PlatformStory` with all content
- [ ] `markAsRead()` creates or updates `UserStoryProgressEntity`
- [ ] `saveQuizScore()` persists percentage score
- [ ] `addSavedWord()` appends to the `savedWordIds` array without duplicates
- [ ] `incrementReadCount()` atomically increments the global read counter

---

### LC-304 · `GET /platform-stories` — list with filters

**Epic:** Story Studio 2.0
**Phase:** 1 — Backend: Platform Stories
**Points:** 3
**Depends on:** LC-303

#### User story

As a mobile app, I want to fetch a paginated list of platform stories filtered by level, category, and topic, so that the Explore section can display relevant content.

#### Endpoint

```
GET /platform-stories?level=A1&category=travel&limit=20&offset=0
Response 200: { stories: PlatformStoryCard[], total: number }
```

#### Query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `level` | `A1\|A2\|B1\|B2` | (all) | Filter by CEFR level |
| `category` | `StoryCategory` | (all) | Filter by category |
| `isFiction` | `boolean` | (all) | Filter fiction vs. non-fiction |
| `limit` | `number` | 20 | Page size |
| `offset` | `number` | 0 | Pagination offset |

#### Acceptance criteria

- [ ] Returns `PlatformStoryCard[]` (no body text — lightweight)
- [ ] Filters compose: `?level=A1&category=travel` returns only A1 travel stories
- [ ] Pagination works: `offset=20&limit=20` returns the second page
- [ ] `total` field reflects total matching count (for UI "X stories" label)
- [ ] Premium stories are included but marked `isPremium: true` (client handles gating)
- [ ] Response sorted by `publishedAt` descending (newest first)

---

### LC-305 · `GET /platform-stories/:id` — full story with all content

**Epic:** Story Studio 2.0
**Phase:** 1 — Backend: Platform Stories
**Points:** 2
**Depends on:** LC-303

#### User story

As a mobile app, I want to fetch the full content of a single platform story including quiz questions, keywords, and grammar notes, so that the story reader can render all tabs.

#### Endpoint

```
GET /platform-stories/:id
Response 200: PlatformStory
Response 404: { message: 'Story not found' }
```

#### Acceptance criteria

- [ ] Returns complete `PlatformStory` object with body text, sentences, quiz, keywords, grammar
- [ ] Atomically increments `readCount` on the story (fire-and-forget, don't block response)
- [ ] Returns 404 if story doesn't exist or `isPublished: false`

---

### LC-306 · Seed 20 platform stories across levels and categories

**Epic:** Story Studio 2.0
**Phase:** 1 — Backend: Platform Stories
**Points:** 5
**Depends on:** LC-303, LC-340

#### User story

As a user, I want a curated initial library of platform stories when I first open the Explore section, so that the experience feels rich and browsable from day one.

#### Seed matrix (20 stories minimum)

| Level | Category | Title Example | Fiction? |
|---|---|---|---|
| A1 | Daily Life | Ein Tag in Berlin | No |
| A1 | Food & Culture | Im Café bestellen | No |
| A1 | Fiction | Der kleine Hund Max | Yes |
| A1 | Travel | Am Bahnhof | No |
| A2 | Work & Career | Mein erster Arbeitstag | No |
| A2 | Technology | Das neue Handy | No |
| A2 | Health & Fitness | Beim Arzt | No |
| A2 | Fiction | Die geheimnisvolle Tür | Yes |
| A2 | Entertainment | Kinoabend mit Freunden | No |
| A2 | Education | Im Deutschkurs | No |
| B1 | Travel | Nachtzüge durch Europa | No |
| B1 | Food & Culture | Weihnachtsmärkte in Deutschland | No |
| B1 | Work & Career | Das Vorstellungsgespräch | No |
| B1 | Nature | Wandern im Schwarzwald | No |
| B1 | Fiction | Die Zeitreisende | Yes |
| B2 | Technology | Künstliche Intelligenz im Alltag | No |
| B2 | Work & Career | Verhandlungen führen | No |
| B2 | Daily Life | WG-Leben in München | No |
| B2 | Fiction | Der letzte Zug nach Wien | Yes |
| B2 | Nature | Klimawandel und Nachhaltigkeit | No |

Each story must include: full German text, English translation, sentence pairs, 5+ quiz questions (per LC-307 formula), 8+ keywords, 2+ grammar notes, cover image URL.

#### Acceptance criteria

- [ ] 20+ stories seeded across all 4 CEFR levels
- [ ] At least 2 categories represented per level
- [ ] At least 4 fiction stories included
- [ ] Every story has quiz questions matching `calculateQuizCount()` formula
- [ ] Every story has keywords with level, article, and wordType populated
- [ ] Stories are marked `isPublished: true`
- [ ] Seed script is idempotent (running twice doesn't create duplicates)

---

### LC-307 · Dynamic quiz count in generation pipeline

**Epic:** Story Studio 2.0
**Phase:** 2 — Backend: Quiz Scaling
**Points:** 2
**Depends on:** LC-301

#### User story

As a language learner, I want the number of quiz questions to scale with story length, so that short stories have at least 5 questions and longer stories have proportionally more.

#### Implementation

Modify `StoryGenerationService` and `StoryPromptBuilder` to use `calculateQuizCount()`:

```typescript
// story-generation.service.ts
const targetQuizCount = calculateQuizCount(content.sentences.length);
const quizPrompt = this.promptBuilder.buildQuizPrompt(content.sentences, cards, targetQuizCount);
```

```typescript
// story-prompt.builder.ts — buildQuizPrompt()
return `Generate exactly ${targetCount} fill-in-the-blank quiz questions...`;
```

#### Acceptance criteria

- [ ] Short stories (≤15 sentences) get exactly 5 quiz questions
- [ ] Medium stories (~20 sentences) get 7 questions
- [ ] Long stories (~30 sentences) get 10 questions
- [ ] The `calculateQuizCount()` function from shared domain is used (not re-implemented)
- [ ] Existing generation flow is unchanged aside from quiz count

---

### LC-308 · Backfill existing stories with additional quiz questions

**Epic:** Story Studio 2.0
**Phase:** 2 — Backend: Quiz Scaling
**Points:** 3
**Depends on:** LC-307

#### User story

As a language learner, I want my existing stories to have the full complement of quiz questions, so that stories generated before the quiz scaling change aren't stuck with only 3–4 questions.

#### Implementation

A one-time migration script (NestJS CLI command) that:

1. Queries all stories where `quizQuestions.length < calculateQuizCount(sentences.length)`
2. For each, generates the missing questions using `StoryPromptBuilder.buildQuizPrompt()`
3. Appends new questions to the existing array (preserves progress on already-answered questions)
4. Saves back to database

#### Acceptance criteria

- [ ] Script runs as `npx ts-node scripts/backfill-quiz-questions.ts`
- [ ] Only stories with fewer questions than the formula requires are touched
- [ ] Existing quiz questions are preserved (not regenerated)
- [ ] New questions are appended, not prepended
- [ ] Script logs: `Backfilled story <id>: 4 → 7 questions`
- [ ] Script is idempotent (running twice does nothing the second time)

---

### LC-310 · Story Studio page — two-section layout (Explore + My Stories)

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 5
**Depends on:** LC-304, LC-314

#### User story

As a language learner, I want the Story Studio to show both platform stories I can explore and my own generated stories, so that I have one unified reading home.

#### Design (from design reference — see `epic-story-studio-redesign-design.html`)

The page layout has three sections in order:

```
┌──────────────────────────────────────┐
│  Header: "Story Studio"        [+]  │  ← page nav with generate FAB
├──────────────────────────────────────┤
│                                      │
│  ┌──── Search bar ─────────────┐     │  ← optional: search across all stories
│  └─────────────────────────────┘     │
│                                      │
│  EXPLORE                             │  ← section header
│  [All] [A1] [A2] [B1] [B2]          │  ← level filter chips
│  [🏠 Daily] [✈️ Travel] [🍽️ Food].. │  ← category filter chips (scrollable)
│                                      │
│  ┌────┐ ┌────┐ ┌────┐               │  ← horizontal scroll: story browse cards
│  │ 📷 │ │ 📷 │ │ 📷 │               │
│  │titl│ │titl│ │titl│               │  ← compact cards: image, title, level, time
│  │ A1 │ │ A2 │ │ B1 │               │
│  └────┘ └────┘ └────┘               │
│                              See all →│
│                                      │
│  ──────────────────────────────────  │  ← divider
│                                      │
│  MY STORIES                    N saved│  ← section header
│  ┌──────────────────────────────┐    │
│  │ Ein gesundes neues Leben     │    │  ← refined story card (see LC-314)
│  │ 2 min · 68 words · A1       │    │
│  │ [chips] [Listen] [Read]  🗑  │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ ...                          │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | Complete rewrite — two-section layout |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | Add `PlatformStoryApiService` injection, explore state, filter signals |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.scss` | New styles for Explore section, browse cards, filter chips |

#### Component state

```typescript
// New signals for explore section
readonly platformStories = signal<PlatformStoryCard[]>([]);
readonly selectedLevel = signal<StoryDifficulty | null>(null);
readonly selectedCategory = signal<StoryCategory | null>(null);
readonly isLoadingExplore = signal(false);
readonly categories = STORY_CATEGORIES;

// Computed: filtered platform stories
readonly filteredPlatformStories = computed(() => {
  let stories = this.platformStories();
  const level = this.selectedLevel();
  const category = this.selectedCategory();
  if (level) stories = stories.filter(s => s.level === level);
  if (category) stories = stories.filter(s => s.category === category);
  return stories;
});
```

#### Acceptance criteria

- [ ] Page shows "Explore" section above "My Stories" section
- [ ] Explore section fetches from `GET /platform-stories` on init
- [ ] Level filter chips (All, A1, A2, B1, B2) filter the explore cards
- [ ] Category filter chips scroll horizontally; tapping one filters to that category
- [ ] Filters compose: selecting A1 + Travel shows only A1 travel stories
- [ ] "See All" link navigates to the drill-down page (LC-313)
- [ ] My Stories section shows user-generated stories with the refined card design (LC-314)
- [ ] Generate FAB (+) in the header opens the generate story sheet
- [ ] If Explore has no stories matching filters: show "No stories found" inline message
- [ ] If My Stories is empty: show existing empty state with generate CTA
- [ ] Pull-to-refresh reloads both sections

---

### LC-311 · Explore section — horizontal category filter chips

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 3
**Depends on:** LC-310

#### User story

As a language learner, I want to filter platform stories by interest category using scrollable chips, so that I can quickly find stories about topics I care about.

#### Design

```
← [🏠 Daily Life] [✈️ Travel] [🍽️ Food & Culture] [💼 Work] [💻 Tech] [🏃 Health] [📚 Education] [🌿 Nature] [🎬 Entertainment] [📖 Fiction] →
```

- Chips scroll horizontally inside a `overflow-x: auto` container
- Active chip: `background: var(--lc-brand)`, `color: white`
- Inactive chip: `background: var(--lc-card)`, `color: var(--lc-text-secondary)`, `border: 1px solid var(--lc-border)`
- Each chip shows the emoji icon + label
- Tapping an active chip deselects it (shows all categories)

#### Acceptance criteria

- [ ] All 10 categories from `STORY_CATEGORIES` render as chips
- [ ] Chips scroll horizontally without wrapping
- [ ] Active state toggles on tap
- [ ] Only one category can be active at a time
- [ ] Tapping the active chip deselects it (returns to "all")
- [ ] Category selection updates `selectedCategory` signal → triggers computed filter

---

### LC-312 · Explore section — story browse cards

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 3
**Depends on:** LC-311

#### User story

As a language learner, I want to see platform stories as attractive, compact cards with cover images, level badges, and titles, so that I can browse and pick stories that look interesting.

#### Card design

```
┌──────────────────┐
│                    │ ← cover image (16:10 ratio, border-radius-lg top)
│    [A1 badge]      │ ← level badge overlay, top-left
│                    │
├──────────────────┤
│ Im Café bestellen  │ ← title (Lora, 13px, semibold)
│ 🕐 2 min · 🍽️     │ ← meta: read time + category icon
│ [5 questions]      │ ← quiz count badge
└──────────────────┘
```

- Card width: `160px` (fits ~2.2 cards on screen at once, encouraging horizontal scroll)
- Cover image: `height: 100px`, `object-fit: cover`
- Level badge: absolute positioned, `padding: 2px 8px`, rounded, brand-green bg + white text
- Premium stories show a small ⭐ icon next to level badge
- Cards in a horizontal `overflow-x: auto` scrollable row

#### Acceptance criteria

- [ ] Cards render in a horizontal scroll container
- [ ] Cover image displays with rounded top corners
- [ ] Level badge (A1/A2/B1/B2) overlays the top-left of the image
- [ ] Premium stories show a star indicator
- [ ] Tapping a card navigates to the story reader (LC-315)
- [ ] Cards show a subtle shadow on the card surface
- [ ] At least 2.2 cards visible on a standard mobile viewport (375px width)

---

### LC-313 · "See All" category drill-down page

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 3
**Depends on:** LC-312

#### User story

As a language learner, I want to tap "See All" to see a full grid of platform stories filtered by my selected level/category, so that I can browse beyond the preview row.

#### Design

```
← Back     Travel Stories (A1)       [filter icon]

┌────┐ ┌────┐
│ 📷 │ │ 📷 │    ← 2-column grid of story cards
│    │ │    │
│titl│ │titl│
└────┘ └────┘
┌────┐ ┌────┐
│ 📷 │ │ 📷 │
│    │ │    │
│titl│ │titl│
└────┘ └────┘
          ...
```

#### Files to create

| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.ts` | Category drill-down page |
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.html` | Template |
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.scss` | Styles |

#### Route

```typescript
{ path: 'stories/explore', component: ExploreCategoryPage }
// Navigate with query params: /stories/explore?level=A1&category=travel
```

#### Acceptance criteria

- [ ] Page receives `level` and `category` from query params or navigation state
- [ ] Displays stories in a 2-column grid layout
- [ ] Each card uses the same design as LC-312 but slightly larger (full-width / 2 - gap)
- [ ] Back button returns to Story Studio
- [ ] Page title reflects the active filters (e.g., "Travel Stories (A1)")
- [ ] Infinite scroll or "Load more" pagination for large result sets
- [ ] Empty state if no stories match filters

---

### LC-314 · My Stories section — refined story card design

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 3
**Depends on:** LC-310

#### User story

As a language learner, I want my generated stories to look cleaner and more polished in the list, so that the Story Studio feels like a premium reading experience, not a raw data list.

#### Current problems (from screenshots)

1. Vocab word chips take up too much vertical space — 3 chips + "+65 more" feels noisy
2. The "AI · Medium" + "Listen" + "Read" footer row is cluttered with too many elements
3. Delete icon (🗑) is too prominent — accidental deletes are a risk
4. No visual hierarchy between title, meta, and actions

#### New card design

```
┌──────────────────────────────────────────┐
│ ┌────┐  Ein gesundes neues Leben         │ ← small cover thumbnail (40x40) + title
│ │ 📷 │  2 min read · 68 words            │ ← meta row
│ └────┘  A1 · Medium                      │ ← level + length badges
├──────────────────────────────────────────┤
│ [hoffentlich] [die Serviette] [die Bar]  │ ← max 3 word chips, compact
│                                +65 more  │
├──────────────────────────────────────────┤
│  ▶ Listen    📖 Read               •••   │ ← actions row: listen, read, overflow menu
└──────────────────────────────────────────┘
```

Key changes:
- **Thumbnail instead of no image**: Small 40×40 rounded cover image on the left of the title
- **Meta row consolidated**: Reading time + word count + level + length all in one line
- **Delete moved to overflow menu**: Three-dot menu (•••) with "Delete" option replaces the prominent trash icon
- **Word chips capped at 3**: Show max 3 chips, then "+N more" as text (not a chip)
- **Card border-radius**: `var(--lc-radius-lg)` for a premium feel

#### Acceptance criteria

- [ ] Card shows a thumbnail image (story cover or generated fallback)
- [ ] Title, meta, and level info are visible without scrolling
- [ ] Word chips capped at 3 + overflow count
- [ ] "Listen" and "Read" buttons are the primary actions
- [ ] Delete is in a three-dot overflow menu (confirmation alert on tap)
- [ ] Incomplete stories (generationStatus === 'partial') show the "Extend" badge
- [ ] Card tap area opens the story reader (whole card is tappable except action buttons)

---

### LC-315 · Platform story detail — reuse existing reader with isPlatform flag

**Epic:** Story Studio 2.0
**Phase:** 3 — Frontend: Story Studio Redesign
**Points:** 2
**Depends on:** LC-305, LC-310

#### User story

As a language learner, I want to open a platform story in the same reader I use for my generated stories, so that the reading experience is consistent regardless of story source.

#### Implementation

The existing `StoryReaderPage` is extended with a `storySource` signal:

```typescript
readonly storySource = signal<'user' | 'platform'>('user');

ngOnInit(): void {
  const id = this.route.snapshot.params['id'];
  const source = this.route.snapshot.data['source'] ?? 'user';
  this.storySource.set(source);

  if (source === 'platform') {
    this.loadPlatformStory(id);
  } else {
    this.loadUserStory(id);
  }
}
```

#### Route

```typescript
{ path: 'stories/platform/:id', component: StoryReaderPage, data: { source: 'platform' } }
```

#### Differences in platform mode

- "Mark as learned" button is hidden (platform stories aren't in user's library)
- "Add to collection" from active word (LC-325) works the same
- Quiz progress is tracked in `UserStoryProgress` (not on the story entity)
- Delete option is not available

#### Acceptance criteria

- [ ] Platform stories open in the same reader as user stories
- [ ] Story tab, Quiz tab, Keywords tab, Grammar tab all work for platform stories
- [ ] "Mark as learned" is hidden for platform stories
- [ ] Quiz score is saved to `UserStoryProgress` via `POST /platform-stories/:id/quiz-score`
- [ ] Audio playback works if `audioUrl` is present
- [ ] Back button returns to the Story Studio (not a different page)

---

### LC-320 · Floating audio player pill

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 3
**Depends on:** LC-R05 (existing tab nav)

#### User story

As a language learner, I want the audio controls to float as a compact pill at the bottom of the reading surface, so that I can scroll through the story while keeping playback controls accessible without them consuming permanent screen space.

#### Design

```
                                              ← story text scrolls freely
  Nachtzüge helfen Menschen, in der           ← tappable words
  Nacht zu reisen.                            ← translation below

  Man schläft im Zug und wacht am             ← more story text
  neuen Ort auf.

        ┌──────────────────────────┐
        │  ▶  story   1.05x   🔁  │          ← floating pill, centered
        └──────────────────────────┘
                                              ← sits above bottom tab bar
```

- Pill: `border-radius: var(--lc-radius-xl)`, `box-shadow: var(--lc-shadow-float)`, `background: var(--lc-brand)`, white text
- Controls: Play/Pause + "story" label + speed badge + repeat toggle
- Pill is positioned `bottom: 70px` (above the app's bottom tab bar)
- On Quiz/Keywords/Grammar tabs: pill is hidden (audio is Story-tab only)
- Optional: Tap the pill to expand to a full player with progress bar

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | Replace fixed bottom audio bar with floating pill |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | Floating pill styles |

#### Acceptance criteria

- [ ] Audio controls render as a floating pill at the bottom of the Story tab
- [ ] Pill shows: play/pause button, "story" label, speed badge, repeat toggle
- [ ] Pill has `position: fixed`, `bottom: 70px`, centered horizontally
- [ ] Pill casts a shadow (`var(--lc-shadow-float)`)
- [ ] Pill is hidden when `activeTab !== 'story'`
- [ ] Tapping play/pause toggles audio playback
- [ ] Speed badge shows current speed (0.75x, 1.0x, 1.05x, 1.25x, 1.5x); tapping cycles through speeds
- [ ] Story text scrolls freely behind/above the pill

---

### LC-321 · Tap-on-word: active word highlight state

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 3
**Depends on:** LC-R05

#### User story

As a language learner, I want to tap any word in the story text to highlight it and see its details, so that I can look up unfamiliar words without leaving the reading surface.

#### Interaction flow

1. User taps a word in the story text (e.g., "Menschen")
2. The word gets highlighted with a brand-green background and white text
3. The cover/header area transitions to show the active word panel (LC-322)
4. Tapping the same word again, tapping another word, or tapping empty space dismisses the active state

#### Implementation

```typescript
// story-reader.page.ts
readonly activeWord = signal<ActiveWordState | null>(null);

interface ActiveWordState {
  word: string;                    // "Menschen"
  sentenceIndex: number;
  wordIndex: number;
  keyword: StoryKeyword | null;    // matched keyword data if available
  isVocab: boolean;                // true if word is in user's vault
  cardId: string | null;
}

onWordTap(segment: WordSegment): void {
  const current = this.activeWord();
  if (current?.word === segment.word && current?.wordIndex === segment.timestampIdx) {
    this.activeWord.set(null);  // toggle off
    return;
  }
  // Match against keywords array
  const keyword = this.story()?.keywords.find(k =>
    k.germanBase.toLowerCase() === segment.word.toLowerCase() ||
    k.german.toLowerCase().includes(segment.word.toLowerCase())
  );
  this.activeWord.set({
    word: segment.word,
    sentenceIndex: segment.sentenceIdx,
    wordIndex: segment.timestampIdx,
    keyword,
    isVocab: segment.isVocab,
    cardId: segment.cardId ?? null,
  });
}
```

#### Word highlight SCSS

```scss
.sr-word {
  cursor: pointer;
  border-radius: 3px;
  padding: 1px 2px;
  transition: background 0.15s, color 0.15s;

  &.active-word {
    background: var(--lc-brand);
    color: white;
    border-radius: 4px;
    padding: 2px 4px;
  }
}
```

#### Acceptance criteria

- [ ] Tapping any word in the story text highlights it with brand-green background
- [ ] Only one word can be active at a time
- [ ] Tapping the active word toggles it off
- [ ] Tapping a different word switches the active word
- [ ] Tapping empty space between words dismisses the active state
- [ ] Active word state is cleared when switching tabs
- [ ] Words matched to a `StoryKeyword` are enriched with translation, article, level data

---

### LC-322 · Active word cover panel — word, plural, article, translation

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 5
**Depends on:** LC-321

#### User story

As a language learner, when I tap a word, I want to see its dictionary form, plural, article, and translation displayed in the cover/header area, so that I get instant context without navigating away.

#### Design (from screenshots — Image 4 shows the pattern)

When a word is active, the cover/header area transforms:

```
┌──────────────────────────────────────────────────┐
│                                                    │
│  ← Back                    ✓ Mark as learned  ⚙  │
│                                                    │
│  der Mensch                                   ▶   │ ← word with article
│  die Menschen   [Plural]                      🏋  │ ← plural form + Plural badge + train icon
│  person, human                                    │ ← English translation
│                                                    │
│  [Conjugate]  (only if verb)                      │ ← conjugate button (LC-323)
│                                                    │
├──────────────────────────────────────────────────┤
│  [Story] [Quiz] [Keywords] [Grammar]              │
```

- Cover background: story cover image with dark overlay, text in white
- Article + word: `Lora, 20px, semibold, white`
- Plural line: `DM Sans, 14px, white, 0.8 opacity` + `[Plural]` badge (teal bg, white text, rounded)
- Translation: `DM Sans, 14px, white, 0.7 opacity`
- Audio play button: ▶ icon, positioned bottom-right of cover (LC-324)
- Train icon: 🏋 icon, below audio button (LC-325)
- Transition: slide-down animation, 200ms ease-out

#### Data sources

| Field | Source |
|---|---|
| Article + word | `keyword.german` or matched card data |
| Plural | `keyword.german` with article change, or enrichment data from card |
| Translation | `keyword.english` or card `front` |
| Word type | `keyword.wordType` |

#### Graceful absence

- If the word is not in keywords: show just the tapped word text + "Tap to add to vocabulary" CTA
- If no plural data available: hide the plural line entirely
- If not a noun: hide the article (verbs, adjectives, adverbs)

#### Acceptance criteria

- [ ] Cover area transforms to show active word details when a word is tapped
- [ ] Article + word display correctly for nouns (der/die/das + word)
- [ ] Plural form shows with "Plural" badge for nouns that have plural data
- [ ] English translation displays below the word
- [ ] Verbs show without article but with "Verb" type badge
- [ ] Adjectives/adverbs show with their respective type badge
- [ ] Unknown words (not in keywords) show the word + "Add to vocabulary" prompt
- [ ] Cover returns to default state (title + meta) when active word is dismissed
- [ ] Transition animation is smooth (200ms ease-out)

---

### LC-323 · Active word — conjugate button (verbs only)

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 3
**Depends on:** LC-322

#### User story

As a language learner, when I tap a verb in the story, I want to see a "Conjugate" button that opens a conjugation table, so that I can study verb forms in context.

#### Design

In the active word cover panel, when `keyword.wordType === 'verb'`:

```
  beraten                               ▶
  to advise                             🏋
  [Conjugate ▸]
```

Tapping "Conjugate" opens a bottom sheet with a conjugation table:

```
┌────────────────────────────────────────────┐
│  beraten — to advise                        │
├────────────────────────────────────────────┤
│  Präsens          │  Präteritum            │
│  ich berate       │  ich beriet            │
│  du berätst       │  du berietest          │
│  er/sie berät     │  er/sie beriet         │
│  wir beraten      │  wir berieten          │
│  ihr beratet      │  ihr berietet          │
│  sie beraten      │  sie berieten          │
├────────────────────────────────────────────┤
│  Perfekt: hat beraten                      │
│  Imperativ: berate! beratet!               │
└────────────────────────────────────────────┘
```

#### Implementation approach

- Conjugation data is fetched on-demand from the backend: `GET /words/:word/conjugate`
- Backend uses AI (Claude Haiku 4.5 via OpenRouter) to generate conjugation
- Response is cached in memory (LRU cache, max 100 entries)
- Loading state shown in the sheet while conjugation generates

#### Acceptance criteria

- [ ] "Conjugate" button appears only when `activeWord.keyword.wordType === 'verb'`
- [ ] Tapping opens a bottom sheet with present + past tense conjugations
- [ ] Conjugation is generated via AI on first request, cached thereafter
- [ ] Loading spinner shows while conjugation generates
- [ ] Sheet is dismissible by swipe-down or tap outside
- [ ] If conjugation fails: sheet shows "Couldn't load conjugation — try again" with retry button

---

### LC-324 · Active word — audio play button in cover

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 2
**Depends on:** LC-322

#### User story

As a language learner, when I tap a word and see it in the cover panel, I want a play button to hear its pronunciation, so that I can learn how to say the word correctly.

#### Implementation

- Audio play button positioned at the bottom-right of the cover area
- Uses the existing `WordAudioService` to play pronunciation
- If word has a `cardId`: uses the card's cached audio
- If word has no `cardId`: generates TTS on-demand via `PronunciationService`

```typescript
playActiveWordAudio(): void {
  const word = this.activeWord();
  if (!word) return;
  const text = word.keyword?.german ?? word.word;
  this.wordAudio.play(text, word.cardId);
}
```

#### Acceptance criteria

- [ ] Play button (▶ icon) appears in the bottom-right of the cover when a word is active
- [ ] Tapping plays the word pronunciation audio
- [ ] Button shows a brief pulse animation while audio plays
- [ ] Audio plays from cache if available, generates on-demand otherwise
- [ ] Button is accessible (aria-label: "Play pronunciation")

---

### LC-325 · Active word — "Add to collection" action with duplicate detection

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 3
**Depends on:** LC-322

#### User story

As a language learner, when I discover a new word in a story, I want to add it to my vocabulary collection directly from the reader, so that I can study it later with flashcards.

#### Design

Below the audio play button in the cover, a train/dumbbell icon (🏋):

- If word already exists in vault: icon is filled/green + tooltip "Already in your vault"
- If word is new: icon is outlined + tapping opens the "Add to collection" sheet

#### Duplicate detection

Uses the existing `CardDedupService` (from LC-AP10) for O(1) lookup:

```typescript
readonly isWordInVault = computed(() => {
  const word = this.activeWord();
  if (!word) return false;
  if (word.cardId) return true;
  return this.cardDedupService.isDuplicate(word.keyword?.germanBase ?? word.word);
});
```

#### "Add to collection" flow

1. Tap the train icon
2. If duplicate: toast "This word is already in your vault" (no action)
3. If new: open the existing `AssignCollectionSheetComponent` with pre-filled word data
4. On confirm: card is created via `CardStore.addCard()`, active word state updates to show "In vault" ✓

#### Acceptance criteria

- [ ] Train icon appears in the cover when a word is active
- [ ] Icon is visually distinct for "in vault" vs. "not in vault" states
- [ ] Tapping when word is in vault: shows toast "Already in your vault"
- [ ] Tapping when word is new: opens assign-collection sheet with pre-filled German word + English translation
- [ ] After adding: icon updates to "in vault" state immediately (optimistic)
- [ ] Duplicate detection uses `CardDedupService` for O(1) lookup
- [ ] Words with `cardId` are always detected as "in vault" without additional lookup

---

### LC-326 · Scrollable story text with sticky tab bar and floating controls

**Epic:** Story Studio 2.0
**Phase:** 4 — Story Reader Refinements
**Points:** 2
**Depends on:** LC-320, LC-322

#### User story

As a language learner, I want the story text to scroll freely while the tab bar stays sticky and audio controls float, so that I can focus on reading without losing access to navigation or playback.

#### Layout structure

```
┌────────────────────────────────────────┐
│ Cover / Active Word Panel              │ ← scrolls with content (not sticky)
├────────────────────────────────────────┤
│ [Story] [Quiz] [Keywords] [Grammar]    │ ← STICKY: stays at top when scrolled past
├────────────────────────────────────────┤
│                                        │
│  Story text scrolls freely...          │ ← scrollable content area
│                                        │
│  Translation text below each sentence  │
│                                        │
│        ┌──── Floating pill ────┐       │ ← FIXED: floating audio controls
│        └───────────────────────┘       │
└────────────────────────────────────────┘
```

#### CSS approach

```scss
.sr-section-tabs {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--lc-card);
  border-bottom: 1px solid var(--lc-border);
}

.sr-floating-pill {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
}
```

#### Acceptance criteria

- [ ] Cover area scrolls with content (not sticky)
- [ ] Tab bar becomes sticky when the user scrolls past the cover
- [ ] Audio pill floats fixed at the bottom, above the app tab bar
- [ ] Story text scrolls freely between the sticky tab bar and the floating pill
- [ ] No content is hidden behind the floating pill (padding-bottom accounts for pill height)
- [ ] Scroll position is preserved when switching between reader tabs

---

### LC-330 · Rename "Manual advance on wrong" → "Pause on mistakes", default ON

**Epic:** Story Studio 2.0
**Phase:** 5 — Quiz Refinements
**Points:** 1
**Depends on:** LC-R08

#### User story

As a language learner, I want the quiz to pause after I answer incorrectly so I can read the hint before moving on, and I want this to be the default behavior.

#### Changes

1. Rename the toggle label from "Manual advance on wrong" to **"Pause on mistakes"**
2. Rename the subtitle from "Read the hint before moving on" to **"Review the correct answer before continuing"**
3. Change the default value from `false` to `true`

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.ts` | Change `manualAdvance = signal(false)` → `pauseOnMistakes = signal(true)` |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.html` | Update label text and signal name |

#### Acceptance criteria

- [ ] Toggle label reads "Pause on mistakes"
- [ ] Toggle subtitle reads "Review the correct answer before continuing"
- [ ] Toggle is ON by default
- [ ] When ON: after a wrong answer, quiz waits for user tap to advance
- [ ] When OFF: quiz auto-advances after 1.5s delay on wrong answer
- [ ] Preference is remembered per session (signal state, not persisted)

---

### LC-331 · Dynamic quiz question count UI

**Epic:** Story Studio 2.0
**Phase:** 5 — Quiz Refinements
**Points:** 2
**Depends on:** LC-307

#### User story

As a language learner, I want the quiz progress indicator (the circle counter) to show the correct total based on the actual number of questions in this story, so that "2/4" is accurate and not always showing "/4".

#### Changes

The existing progress ring hardcodes `/ 4`. It should use `quizQuestions.length`:

```html
<!-- BEFORE -->
<div class="quiz-progress-ring">{{ currentQuestion() + 1 }}/4</div>

<!-- AFTER -->
<div class="quiz-progress-ring">{{ currentQuestion() + 1 }}/{{ totalQuestions() }}</div>
```

Where `totalQuestions = computed(() => this.story()?.quizQuestions.length ?? 0)`.

The progress ring's fill percentage should also reflect the actual count: `strokeDashoffset = circumference * (1 - (current + 1) / total)`.

#### Acceptance criteria

- [ ] Progress ring shows actual question count (e.g., "3/7" not "3/4")
- [ ] Ring fill animation accurately reflects progress percentage
- [ ] Ring is complete (full circle) on the last question
- [ ] Works correctly for any quiz count (5, 7, 10, etc.)

---

### LC-332 · Quiz — sentence audio auto-play on question load

**Epic:** Story Studio 2.0
**Phase:** 5 — Quiz Refinements
**Points:** 2
**Depends on:** LC-R08

#### User story

As a language learner, I want the quiz sentence to be read aloud automatically when each question loads, so that I'm training my listening comprehension alongside grammar.

#### Implementation

When a new quiz question is displayed:

1. If `quizQuestion.audioSentence` exists: play it using `WordAudioService.playText()`
2. Auto-play only on initial load, not on re-visits (track `playedQuestionIds` set)
3. The existing 🔊 button remains for manual replay

```typescript
effect(() => {
  const q = this.currentQuizQuestion();
  if (q && !this.playedQuestionIds.has(q.id)) {
    this.playedQuestionIds.add(q.id);
    this.wordAudio.playText(q.sentenceDe);
  }
});
```

#### Acceptance criteria

- [ ] Audio plays automatically when a new question appears
- [ ] Audio does not replay when revisiting a question (navigating back)
- [ ] Manual 🔊 button still works for replay
- [ ] If audio generation fails: question loads normally, no error shown
- [ ] Auto-play respects device mute/silent mode

---

### LC-340 · Admin: AI batch-generate platform stories from topic+level matrix

**Epic:** Story Studio 2.0
**Phase:** 6 — Platform Story Content Pipeline
**Points:** 5
**Depends on:** LC-302, LC-303

#### User story

As a content creator, I want a CLI command to batch-generate platform stories from a topic×level matrix, so that the Explore library can be populated efficiently.

#### CLI command

```bash
npx ts-node scripts/generate-platform-stories.ts \
  --level A1 \
  --category travel \
  --count 5 \
  --model claude-sonnet-4-6
```

#### Generation pipeline (per story)

1. AI generates story text (title, bodyDe, bodyEn, sentences)
2. AI generates quiz questions (using `calculateQuizCount()`)
3. AI generates grammar notes
4. AI generates/enriches keywords
5. TTS generates audio narration
6. Cover image is generated or assigned
7. Story is saved to `platform_stories` table

#### Acceptance criteria

- [ ] CLI command accepts `--level`, `--category`, `--count`, `--model` parameters
- [ ] Stories are generated with all required fields populated
- [ ] Quiz count follows the `calculateQuizCount()` formula
- [ ] Each story is saved to `platform_stories` with `isPublished: true`
- [ ] Progress logs: `Generated 1/5: "Am Bahnhof" (A1, travel, 12 sentences, 5 quiz)`
- [ ] Failures don't stop the batch — failed stories are logged and skipped
- [ ] Total generation time is logged at the end

---

### LC-341 · Platform story cover image generation

**Epic:** Story Studio 2.0
**Phase:** 6 — Platform Story Content Pipeline
**Points:** 3
**Depends on:** LC-340

#### User story

As a content creator, I want cover images to be generated or assigned for each platform story, so that the Explore cards look visually appealing.

#### Approach

Option A (preferred): Use a stock photo API (Unsplash/Pexels) with category-based search terms:

```typescript
const searchTerms: Record<StoryCategory, string> = {
  'daily-life': 'everyday life germany',
  'travel': 'european train travel',
  'food-culture': 'german restaurant cuisine',
  'work-career': 'office meeting professional',
  // ...
};
```

Option B (fallback): Generate with AI image generation (if available).

Option C (minimum viable): Gradient backgrounds with category icon overlay.

#### Acceptance criteria

- [ ] Every platform story has a `coverImageUrl` that is not null
- [ ] Images are stored in Cloudflare R2 under `platform-stories/covers/`
- [ ] Images are approximately 800×500px (16:10 ratio)
- [ ] Images are relevant to the story's category and content
- [ ] Fallback to gradient + icon if image generation/fetch fails

---

### LC-342 · Platform story audio generation

**Epic:** Story Studio 2.0
**Phase:** 6 — Platform Story Content Pipeline
**Points:** 3
**Depends on:** LC-340

#### User story

As a language learner, I want platform stories to have audio narration, so that I can listen along while reading.

#### Implementation

Reuses the existing `StoryAudioService` pipeline:

1. Generate full narration via Gemini TTS
2. Generate word timestamps via alignment
3. Upload audio to R2 under `platform-stories/audio/`
4. Store `audioUrl` and `audioDurationMs` on the entity

#### Acceptance criteria

- [ ] Every platform story has an `audioUrl` after generation
- [ ] Word timestamps are populated for karaoke highlighting
- [ ] Audio is stored in R2 and accessible via URL
- [ ] If audio generation fails: story is saved without audio (graceful absence)

---

### LC-343 · Story engagement analytics

**Epic:** Story Studio 2.0
**Phase:** 7 — Polish & Analytics
**Points:** 2
**Depends on:** LC-310, LC-315

#### Events to track

| Event | Fired when | Properties |
|---|---|---|
| `story_explore_view` | User opens Story Studio | `platformStoryCount: number` |
| `story_explore_filter` | User taps a level or category filter | `level: string, category: string` |
| `story_platform_open` | User opens a platform story | `storyId, level, category, isFiction` |
| `story_platform_quiz_complete` | User finishes quiz on platform story | `storyId, score, questionsTotal` |
| `story_word_tapped` | User taps a word in the reader | `word, isVocab, hasKeyword` |
| `story_word_added` | User adds a word from reader to vault | `word, storyId, source: 'reader'` |

#### Acceptance criteria

- [ ] All 6 events fire at the correct lifecycle moments
- [ ] Events include the specified properties
- [ ] Analytics calls are fire-and-forget

---

### LC-344 · Empty state for Explore section

**Epic:** Story Studio 2.0
**Phase:** 7 — Polish & Analytics
**Points:** 1
**Depends on:** LC-310

#### User story

As a user on a slow connection, I want to see a meaningful loading/empty state in the Explore section, so that I know content is coming.

#### States

1. **Loading**: Skeleton cards (3 placeholder cards with shimmer animation)
2. **Empty (no stories)**: Icon + "Stories are on the way! Check back soon." message
3. **Error**: Icon + "Couldn't load stories. Pull to refresh." message

#### Acceptance criteria

- [ ] Skeleton loading state shows during initial fetch
- [ ] Empty state renders if API returns 0 stories
- [ ] Error state renders if API call fails
- [ ] Pull-to-refresh works from all three states

---

### LC-345 · CLAUDE.md update

**Epic:** Story Studio 2.0
**Phase:** 7 — Polish & Analytics
**Points:** 1
**Depends on:** all other tickets

#### Changes to CLAUDE.md

Add to the epics table:

```
| 14 | Story Studio 2.0 | 📋 Planned | `apps/mobile/epic-story-studio-redesign.md`, `epic-story-studio-redesign-design.html` |
```

Add to the documentation map:

```
| `apps/mobile/epic-story-studio-redesign.md` | Story Studio 2.0 — Explore, read, interact |
| `epic-story-studio-redesign-design.html` | Design reference for Story Studio 2.0 |
```

Add new service to architecture:

```
features/stories/
  ├── services/
  │   ├── story-api.service.ts
  │   └── platform-story-api.service.ts     ← NEW: platform story API
```

#### Acceptance criteria

- [ ] CLAUDE.md epics table has row for Epic 14
- [ ] Documentation map includes both new files
- [ ] Architecture tree includes `platform-story-api.service.ts`

---

## Dependency Graph

```
LC-300 (domain types)
  ├── LC-301 (quiz count formula)
  │   ├── LC-307 (quiz scaling in generation)
  │   │   └── LC-308 (backfill existing stories)
  │   └── LC-331 (quiz count UI)
  ├── LC-302 (platform story entity)
  │   ├── LC-303 (platform stories service)
  │   │   ├── LC-304 (GET /platform-stories)
  │   │   ├── LC-305 (GET /platform-stories/:id)
  │   │   └── LC-306 (seed 20 stories)
  │   └── LC-340 (batch generation CLI)
  │       ├── LC-341 (cover images)
  │       └── LC-342 (audio generation)
  ├── LC-310 (story studio redesign)
  │   ├── LC-311 (category filter chips)
  │   │   └── LC-312 (browse cards)
  │   │       └── LC-313 (see all page)
  │   ├── LC-314 (refined story cards)
  │   └── LC-315 (platform story reader)
  └── LC-321 (tap-on-word)
      └── LC-322 (active word panel)
          ├── LC-323 (conjugate button)
          ├── LC-324 (audio play)
          └── LC-325 (add to collection)

LC-320 (floating pill) ─── depends on LC-R05 (existing tab nav)
LC-326 (scroll layout) ─── depends on LC-320, LC-322
LC-330 (pause on mistakes) ─── depends on LC-R08
LC-332 (quiz auto-play) ─── depends on LC-R08

LC-343 (analytics) ─── depends on LC-310, LC-315
LC-344 (empty states) ─── depends on LC-310
LC-345 (CLAUDE.md) ─── depends on all
```

---

## Non-goals (out of scope for this epic)

- **User-generated story sharing / social features** — future epic
- **Community-contributed stories** — separate from platform stories; future epic
- **Story bookmarks / reading list** — may be added as a fast-follow
- **Offline platform stories** — platform stories require network; offline is a future enhancement
- **Multi-language support** — currently German only; architecture is language-agnostic but content isn't
- **Story comments / discussion** — social feature, out of scope
- **Story difficulty auto-detection** — level is assigned at creation time by the AI
- **Reading comprehension questions (beyond fill-in-blank)** — future quiz type expansion
- **Conjugation table caching in database** — in-memory LRU cache is sufficient for now
- **Cover image editing / upload by users** — users get auto-generated covers

---

## Architecture Decision Records

### ADR-1: Separate table for platform stories vs. extending `stories`

**Decision:** Create a separate `platform_stories` table rather than adding an `isPlatform` flag to the existing `stories` table.

**Rationale:**
- Platform stories have no `userId` — they belong to the platform
- Query patterns are different (platform stories need category/level indexes; user stories need userId index)
- Platform stories have additional fields (`readCount`, `isPublished`, `isPremium`) that don't apply to user stories
- Keeps the `stories` table lean and focused on user-generated content
- Avoids complex WHERE clauses on every user story query to filter out platform stories

**Trade-off:** Some code duplication in the reader (loading from two different sources). Mitigated by the `storySource` signal pattern in LC-315.

### ADR-2: Client-side category filtering vs. server-side

**Decision:** Fetch all platform stories on page load (up to 100), filter client-side. Server-side filtering available for paginated drill-down (LC-313).

**Rationale:**
- The initial Explore view shows a horizontal scroll of ~8 stories per category — the total dataset is small enough to cache client-side
- Category chip tapping feels instant with client-side filtering (no network round-trip)
- The "See All" drill-down page uses server-side filtering with pagination for larger datasets

### ADR-3: Conjugation generated on-demand vs. pre-computed

**Decision:** Generate verb conjugations on-demand via AI, cached in-memory.

**Rationale:**
- Pre-computing conjugation for every keyword in every story would be expensive and mostly wasted (users tap a small fraction of words)
- LRU cache (100 entries) means popular verbs are effectively instant after first lookup
- Claude Haiku 4.5 conjugation generation is fast (~500ms) and accurate for German
- Future: could persist to database if cache hit rate justifies it

---

## Files Created / Modified Summary

### New files

| File | Story |
|---|---|
| `apps/api/src/platform-stories/platform-story.entity.ts` | LC-302 |
| `apps/api/src/platform-stories/user-story-progress.entity.ts` | LC-302 |
| `apps/api/src/platform-stories/platform-stories.service.ts` | LC-303 |
| `apps/api/src/platform-stories/platform-stories.controller.ts` | LC-304, LC-305 |
| `apps/api/src/platform-stories/platform-stories.module.ts` | LC-303 |
| `apps/mobile/src/app/features/stories/services/platform-story-api.service.ts` | LC-310 |
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.ts` | LC-313 |
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.html` | LC-313 |
| `apps/mobile/src/app/features/stories/pages/explore-category/explore-category.page.scss` | LC-313 |
| `apps/mobile/src/app/features/stories/components/story-browse-card/story-browse-card.component.ts` | LC-312 |
| `apps/mobile/src/app/features/stories/components/conjugation-sheet/conjugation-sheet.component.ts` | LC-323 |
| `scripts/generate-platform-stories.ts` | LC-340 |
| `scripts/backfill-quiz-questions.ts` | LC-308 |

### Modified files

| File | Stories |
|---|---|
| `libs/shared/domain/src/index.ts` | LC-300, LC-301 |
| `apps/api/src/stories/story-generation.service.ts` | LC-307 |
| `apps/api/src/stories/story-prompt.builder.ts` | LC-307 |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | LC-310, LC-311, LC-314 |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | LC-310, LC-311, LC-312, LC-314 |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.scss` | LC-310, LC-311, LC-312, LC-314 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | LC-315, LC-320, LC-321, LC-322, LC-324, LC-325, LC-326 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | LC-320, LC-321, LC-322, LC-323, LC-324, LC-325, LC-326 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | LC-320, LC-321, LC-322, LC-326 |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.ts` | LC-330, LC-331, LC-332 |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.html` | LC-330, LC-331 |
| `CLAUDE.md` | LC-345 |
