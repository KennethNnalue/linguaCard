# Epic: Global Word Audio Registry & Word Deduplication

## Epic Number: LC-100+ (next available block)

## Feature Area: `shared/audio/`, `features/ai/audio/`, `apps/api/src/audio/`, `apps/api/src/cards/`

---

## 1 · Problem Statement

Audio generation (TTS via Gemini) is our single most expensive AI operation per unit. Today, every pronunciation audio is keyed by **cardId** — stored at `pronunciation/{cardId}.wav` in R2. This means:

1. **The same German word generates audio multiple times.** A user who has "der Hund" in three collections pays for three separate TTS calls and stores three identical `.wav` files in R2.
2. **No duplicate detection exists for words.** Cards are created independently via add-word, CSV import, and image import with zero cross-referencing. The same word can exist N times across the user's vault.
3. **Example sentences cannot reuse word-level audio.** The listen feature speaks full example sentences via Web Speech or ephemeral TTS — even though individual vocab words within those sentences already have (or could have) persisted audio.
4. **Story keywords without a `cardId` get ephemeral on-demand TTS** (`playText()` with no cardId → object URL, discarded after playback). These are often real vocab words that deserve persisted audio.
5. **`CardContent.audioAssetId` is declared but always `null`** — the field exists in the domain type but is never populated. It was intended for exactly this purpose.

### Cost impact

With ~500 words per active user and an average of 1.4 cards per unique word (duplicates across collections), roughly 30% of TTS calls today are wasted regenerations. At scale (10K users × 500 words × 30% waste), that's 1.5M unnecessary TTS calls.

---

## 2 · Current Architecture Analysis

### 2.1 — How pronunciation works today

```
User taps 🔊 on a card
       │
       ▼
PronunciationService.play(card)
       │
       ├─ Builds text: "{article} {back}" → e.g. "der Hund"
       │
       ▼
PronunciationService._resolveUrl(text, 'de-DE', card.id)
       │
       ├─ 1. In-memory Map<cacheKey, url>          → hit? play & return
       ├─ 2. Capacitor Filesystem (device cache)    → hit? play & return
       ├─ 3. POST /ai/pronunciation { cardId, text, language }
       │      └─ Backend: Gemini TTS → R2 upload at pronunciation/{cardId}.wav
       │         └─ Returns { audioUrl, durationMs }
       └─ 4. Fallback: Web Speech API (AudioService.speak)
```

**Key observation:** The cache key is `pronunciation-{cardId}`. Two cards with identical `back: "Hund"` and `article: "der"` produce different cache keys (`pronunciation-card-123` vs `pronunciation-card-456`), triggering two separate TTS generations and two separate R2 files.

### 2.2 — All audio consumers in the app

| Consumer | File | What it plays | How |
|----------|------|---------------|-----|
| Word detail | `word-detail.component.ts` | Single word pronunciation | `PronunciationService.play(card)` |
| Review flashcard | `review.page.ts` | Auto-play word on flip | `PronunciationService.play(card)` |
| Listen playlist | `listen.store.ts` | Word + examples sequentially | `PronunciationService.playTextAsPromise(text, 'de-DE', card.id)` for German; `AudioService.speak()` for English |
| Story keywords | `story-reader.page.ts` | Tap keyword to hear it | `PronunciationService.playText(text, 'de-DE', keyword.cardId ?? undefined)` |
| Story quiz | `story-reader.page.ts` | Quiz word pronunciation | Same as keywords |
| Collection detail | `collection-detail.page.ts` | Word card audio button | `PronunciationService.play(card)` |
| Word card (shared) | `word-card.component.ts` | Audio button on card tile | Emits `playAudio` event → parent calls PronunciationService |

### 2.3 — Card creation entry points (where duplicates enter)

| Entry point | File | Duplicate check? |
|-------------|------|-------------------|
| Add word sheet | `add-word-sheet.component.ts` | ❌ None |
| CSV import | `import-review.page.ts` | ❌ None |
| Image import | `image-import-review.page.ts` | ❌ None |
| Future: Community decks | Not yet built | ❌ None |

### 2.4 — Domain model gaps

```typescript
// libs/shared/domain/src/index.ts
interface CardContent {
  // ...
  audioAssetId: string | null;  // ← Always null. Never populated.
  // ...
}

interface AudioAsset {
  id: string;
  url: string;
  type: 'recording' | 'tts';
  language: LanguageCode;
  text: string;
  durationSeconds: number;
}
// AudioAsset exists in domain types but has no backend entity,
// no API endpoint, and no frontend consumer.
```

---

## 3 · Target Architecture

### 3.1 — Core concept: Word Audio Registry

Introduce a **global word audio registry** — a backend table and service that maps normalized word text to a single audio file. The key insight is that audio identity should be based on **what is spoken**, not which card requests it.

```
┌──────────────────────────────────────────────────────────────────┐
│                    WORD AUDIO REGISTRY                           │
│                                                                  │
│  Canonical key: normalize(text) + language                       │
│  Example: "der hund" + "de-DE" → word-audio/a1b2c3d4.wav       │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ Card "Hund" │    │ Card "Hund" │    │ Story kw    │          │
│  │ col-001     │    │ col-003     │    │ "der Hund"  │          │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            ▼                                     │
│              ┌─────────────────────────┐                         │
│              │  WordAudio record       │                         │
│              │  id: "wa-a1b2c3d4"      │                         │
│              │  normalizedText: "der   │                         │
│              │    hund"                │                         │
│              │  language: "de-DE"      │                         │
│              │  audioUrl: "https://    │                         │
│              │    .../word-audio/      │                         │
│              │    a1b2c3d4.wav"        │                         │
│              │  durationMs: 850        │                         │
│              │  generatedAt: ...       │                         │
│              └─────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 — Normalization algorithm

The normalization function determines whether two texts are "the same word" for audio purposes. It must be deterministic, language-aware, and produce identical output for inputs that sound identical when spoken.

```typescript
function normalizeForAudio(text: string, language: string): string {
  let normalized = text
    .toLowerCase()
    .trim()
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Strip trailing punctuation (periods, commas, exclamation, question)
    .replace(/[.,!?;:]+$/, '')
    // Normalize German-specific: ß stays ß, umlauts stay
    // (ä ≠ ae for pronunciation — "Bär" vs "Baer" sound different in TTS)
    ;

  return normalized;
}
```

**Why not hash the text?** We use the normalized text as the logical key (for uniqueness checks and human readability) but derive a short hash for the R2 storage path to keep URLs clean:

```typescript
// Storage path: word-audio/{sha256-first-12-chars}.wav
// DB unique index: (normalizedText, language)
```

### 3.3 — Resolution flow (new)

```
User taps 🔊
       │
       ▼
PronunciationService.play(card)
       │
       ├─ Builds text: "{article} {back}" → "der Hund"
       ├─ normalizedText = normalize("der Hund", "de-DE") → "der hund"
       │
       ▼
WordAudioService.resolve(normalizedText, language)
       │
       ├─ 1. In-memory Map<normalizedKey, url>         → hit? return url
       ├─ 2. Capacitor Filesystem (device cache)        → hit? return url
       ├─ 3. GET /api/v1/word-audio?text={}&lang={}
       │      └─ Backend lookup: word_audio table
       │         ├─ Found? → return existing audioUrl
       │         └─ Not found? → Gemini TTS → R2 upload → insert row → return audioUrl
       └─ 4. Fallback: Web Speech API
```

### 3.4 — Database schema

```sql
CREATE TABLE word_audio (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_text VARCHAR(500) NOT NULL,
  display_text  VARCHAR(500) NOT NULL,  -- original form for display: "der Hund"
  language      VARCHAR(10) NOT NULL DEFAULT 'de-DE',
  audio_url     VARCHAR(1000),          -- R2 public URL
  storage_path  VARCHAR(500),           -- R2 key: word-audio/{hash}.wav
  duration_ms   INTEGER DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'pending',  -- pending | ready | failed
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_word_audio_text_lang UNIQUE (normalized_text, language)
);

CREATE INDEX idx_word_audio_normalized ON word_audio (normalized_text, language);
CREATE INDEX idx_word_audio_status ON word_audio (status);
```

### 3.5 — Word deduplication for cards

When creating a card (from any entry point), the system checks whether a card with the same `(back, article, userId)` triple already exists. This is a "soft" check — it warns the user rather than blocking.

```typescript
// Deduplication check (backend)
async findDuplicate(userId: string, back: string, article: string | null): Promise<Card | null> {
  const normalizedBack = back.toLowerCase().trim();
  return this.repo.createQueryBuilder('card')
    .where('card.userId = :userId', { userId })
    .andWhere("LOWER(TRIM(card.content->>'back')) = :back", { back: normalizedBack })
    .andWhere(
      article
        ? "card.content->>'article' = :article"
        : "card.content->>'article' IS NULL",
      { article }
    )
    .getOne();
}
```

For imports (CSV and image), deduplication runs against the full batch + existing vault to surface duplicates before confirming.

---

## 4 · Scope boundaries

### In scope

- Global word audio registry (backend entity, service, API)
- Word audio resolution service (Angular — replaces card-keyed pronunciation)
- Device-side caching keyed by normalized word (replaces cardId-keyed cache)
- Word deduplication detection on card creation and import
- Migration script: deduplicate existing R2 files, populate word_audio table
- Reuse word audio in story keyword sections, quiz sections, and listen playlists

### Out of scope (explicitly deferred)

- **Full story narration audio** — stories generate full-text TTS for karaoke highlighting. Reusing word-level audio for story narration would require audio splicing/concatenation which is a separate R&D effort.
- **Cross-user audio sharing** — the word audio registry is per-user for now. A global cross-user registry is a future phase (raises privacy/billing questions).
- **Audio quality variants** — single quality/voice per word. Multiple voices or speeds are deferred.

> **Note:** Example sentence audio (originally deferred) is now in scope as Phase 6 (LC-SA01, LC-SA02) after confirming the registry handles arbitrary text with no backend changes. See ADR-6.

---

## 5 · Story Map

| Phase | Ticket | Title | Points | Depends on |
|-------|--------|-------|--------|------------|
| 0 — Domain | LC-WA01 | WordAudio domain types & shared DTOs | 1 | — |
| 1 — Backend | LC-WA02 | WordAudio entity, repository & migration | 3 | WA01 |
| 1 — Backend | LC-WA03 | WordAudioService — resolve, generate, persist | 5 | WA02 |
| 1 — Backend | LC-WA04 | WordAudio API endpoints (resolve, batch-resolve, status) | 3 | WA03 |
| 1 — Backend | LC-WA05 | Refactor `/ai/pronunciation` → use WordAudioService | 3 | WA03 |
| 2 — Angular | LC-WA06 | WordAudioService (Angular) — resolution + device cache | 5 | WA04 |
| 2 — Angular | LC-WA07 | Refactor PronunciationService → WordAudioService | 3 | WA06 |
| 2 — Angular | LC-WA08 | Wire all audio consumers to new service | 3 | WA07 |
| 3 — Dedup | LC-WA09 | Backend word deduplication check endpoint | 3 | WA01 |
| 3 — Dedup | LC-WA10 | Add-word sheet: duplicate warning UX | 2 | WA09 |
| 3 — Dedup | LC-WA11 | Import flows: batch duplicate detection & warning | 3 | WA09 |
| 4 — Migration | LC-WA12 | Data migration: existing card audio → word_audio registry | 5 | WA03, WA05 |
| 4 — Migration | LC-WA13 | R2 cleanup: deduplicate storage, remove orphaned files | 3 | WA12 |
| 5 — Polish | LC-WA14 | Batch pre-generation: generate audio on card creation | 2 | WA03 |
| 5 — Polish | LC-WA15 | Audio generation status UI (pending/ready indicators) | 2 | WA06 |
| 5 — Polish | LC-WA16 | Analytics: audio cache hit rate & generation cost tracking | 2 | WA06 |
| 6 — Sentences | LC-SA01 | Example sentence audio — Listen playlist via word audio registry | 3 | WA08 |
| 6 — Sentences | LC-SA02 | Pre-warm sentences on playlist load | 2 | SA01 |

**Total: 53 points**

---

## 6 · User Stories

---

### LC-WA01 · WordAudio domain types & shared DTOs

**Phase:** 0 — Domain (do this first)
**Points:** 1
**Depends on:** —

#### User story

As a developer, I want shared domain types for the word audio registry so that the Angular app and NestJS API share a single contract from day one.

#### Types to add to `libs/shared/domain/src/index.ts`

```typescript
// ─── WORD AUDIO ───────────────────────────────────────────────────────────────

export interface WordAudio {
  id: string;
  normalizedText: string;
  displayText: string;
  language: LanguageCode;
  audioUrl: string | null;
  storagePath: string | null;
  durationMs: number;
  status: WordAudioStatus;
  createdAt: string;
  updatedAt: string;
}

export type WordAudioStatus = 'pending' | 'ready' | 'failed';

export interface WordAudioResolveRequest {
  text: string;
  language?: string;  // defaults to 'de-DE'
}

export interface WordAudioResolveResponse {
  wordAudio: WordAudio;
  cached: boolean;  // true if audio already existed (no TTS call made)
}

export interface WordAudioBatchResolveRequest {
  words: WordAudioResolveRequest[];
}

export interface WordAudioBatchResolveResponse {
  results: WordAudioResolveResponse[];
  generated: number;  // count of newly generated
  reused: number;     // count of cache hits
}
```

#### Types to add to `libs/shared/dto/src/index.ts`

```typescript
export class ResolveWordAudioDto {
  @IsString() @MinLength(1) text!: string;
  @IsOptional() @IsString() language?: string;
}

export class BatchResolveWordAudioDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResolveWordAudioDto)
  words!: ResolveWordAudioDto[];
}
```

#### Acceptance criteria

- [ ] `WordAudio`, `WordAudioStatus`, `WordAudioResolveRequest`, `WordAudioResolveResponse`, `WordAudioBatchResolveRequest`, `WordAudioBatchResolveResponse` exported from `@lingua-card/shared/domain`
- [ ] `ResolveWordAudioDto`, `BatchResolveWordAudioDto` exported from `@lingua-card/shared/dto`
- [ ] Existing `AudioAsset` interface updated with a comment noting it will be deprecated in favor of `WordAudio`
- [ ] `CardContent.audioAssetId` comment updated to note it will be replaced by a `wordAudioId` reference

---

### LC-WA02 · WordAudio entity, repository & migration

**Phase:** 1 — Backend
**Points:** 3
**Depends on:** WA01

#### User story

As a developer, I want a `word_audio` database table with a unique index on `(normalized_text, language)` so that the system can guarantee one audio file per unique word.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/word-audio.entity.ts` | TypeORM entity |
| `apps/api/src/word-audio/word-audio.module.ts` | NestJS module |
| `apps/api/src/word-audio/word-audio.repository.ts` | Custom repository with `findByNormalizedText()` |

#### Entity

```typescript
@Entity('word_audio')
@Unique(['normalizedText', 'language'])
export class WordAudioEntity {
  @PrimaryColumn()
  id!: string;

  @Index('idx_word_audio_normalized')
  @Column({ length: 500 })
  normalizedText!: string;

  @Column({ length: 500 })
  displayText!: string;

  @Column({ length: 10, default: 'de-DE' })
  language!: string;

  @Column({ nullable: true, type: 'varchar', length: 1000 })
  audioUrl!: string | null;

  @Column({ nullable: true, type: 'varchar', length: 500 })
  storagePath!: string | null;

  @Column({ default: 0 })
  durationMs!: number;

  @Column({ length: 20, default: 'pending' })
  status!: string;  // 'pending' | 'ready' | 'failed'

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```

#### Acceptance criteria

- [ ] `word_audio` table created by TypeORM synchronization/migration
- [ ] Unique constraint on `(normalized_text, language)` enforced at DB level
- [ ] Index on `(normalized_text, language)` for fast lookups
- [ ] Index on `status` for batch queries (find pending/failed entries)
- [ ] Repository method `findByNormalizedText(text, language)` returns `WordAudioEntity | null`
- [ ] Repository method `findByNormalizedTexts(texts[], language)` returns multiple in one query
- [ ] Unit test: inserting two rows with same `(normalizedText, language)` throws unique constraint violation

---

### LC-WA03 · WordAudioService — resolve, generate, persist

**Phase:** 1 — Backend
**Points:** 5
**Depends on:** WA02

#### User story

As the system, I want a single service that resolves word audio by normalized text — returning existing audio or generating new audio exactly once — so that no word is ever generated twice.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/word-audio.service.ts` | Core service |
| `apps/api/src/word-audio/normalize.ts` | Pure normalization function |

#### Normalization function

```typescript
// word-audio/normalize.ts
export function normalizeForAudio(text: string, _language: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:"""''()]+$/, '')
    .replace(/[.,!?;:"""''()]+(?=\s)/g, '');
}

export function audioStorageHash(normalizedText: string, language: string): string {
  const input = `${language}:${normalizedText}`;
  // Use first 16 chars of SHA-256 hex for collision-free short paths
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}
```

#### Service core logic

```typescript
@Injectable()
export class WordAudioService {
  // Prevents concurrent duplicate generation:
  // If two requests arrive for the same word simultaneously,
  // the second awaits the first's Promise instead of generating again.
  private readonly inflightGenerations = new Map<string, Promise<WordAudioEntity>>();

  async resolve(text: string, language = 'de-DE'): Promise<WordAudioResolveResponse> {
    const normalizedText = normalizeForAudio(text, language);
    const existing = await this.repo.findByNormalizedText(normalizedText, language);
    if (existing && existing.status === 'ready') {
      return { wordAudio: this.toModel(existing), cached: true };
    }

    // Check inflight
    const inflightKey = `${language}:${normalizedText}`;
    if (this.inflightGenerations.has(inflightKey)) {
      const entity = await this.inflightGenerations.get(inflightKey)!;
      return { wordAudio: this.toModel(entity), cached: true };
    }

    // Generate
    const generation = this.generateAndPersist(normalizedText, text, language);
    this.inflightGenerations.set(inflightKey, generation);
    try {
      const entity = await generation;
      return { wordAudio: this.toModel(entity), cached: false };
    } finally {
      this.inflightGenerations.delete(inflightKey);
    }
  }

  async batchResolve(words: WordAudioResolveRequest[]): Promise<WordAudioBatchResolveResponse> {
    // 1. Normalize all words
    // 2. Batch-query existing from DB
    // 3. Generate only missing ones (with concurrency limit of 5)
    // 4. Return combined results
  }

  private async generateAndPersist(
    normalizedText: string, displayText: string, language: string
  ): Promise<WordAudioEntity> {
    const hash = audioStorageHash(normalizedText, language);
    const storagePath = `word-audio/${hash}.wav`;

    // Create pending record (or update failed one)
    let entity = await this.repo.findByNormalizedText(normalizedText, language);
    if (!entity) {
      entity = this.repo.create({
        id: randomUUID(),
        normalizedText,
        displayText,
        language,
        status: 'pending',
        storagePath,
      });
      await this.repo.save(entity);
    }

    try {
      const speech = await this.gemini.generateSpeech({
        text: displayText,
        language,
      });

      const audioUrl = await this.storage.upload(
        Buffer.from(speech.audioBuffer),
        storagePath,
        'audio/wav',
      );

      entity.audioUrl = audioUrl;
      entity.durationMs = speech.durationMs;
      entity.status = 'ready';
      return await this.repo.save(entity);
    } catch (err) {
      entity.status = 'failed';
      await this.repo.save(entity);
      throw err;
    }
  }
}
```

#### Acceptance criteria

- [ ] `resolve(text, language)` returns existing audio if normalized text matches (no TTS call)
- [ ] `resolve(text, language)` generates audio exactly once for a new word, persists to R2, and returns the URL
- [ ] Concurrent calls for the same word during generation await the same Promise (inflight dedup)
- [ ] `batchResolve()` queries DB in bulk, generates only missing words, respects concurrency limit of 5
- [ ] Failed generations set `status: 'failed'` and can be retried
- [ ] Normalization: `"der Hund"`, `"Der Hund"`, `"der hund"`, `"der Hund."` all resolve to the same record
- [ ] Storage path uses hash: `word-audio/{16-char-hex}.wav`
- [ ] Unit test: calling `resolve("der Hund")` twice produces one DB row and one R2 upload
- [ ] Unit test: `batchResolve()` with 10 words where 6 exist generates only 4

---

### LC-WA04 · WordAudio API endpoints

**Phase:** 1 — Backend
**Points:** 3
**Depends on:** WA03

#### User story

As the mobile app, I need API endpoints to resolve word audio so I can fetch or trigger generation of audio for any word.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/word-audio.controller.ts` | REST controller |

#### Endpoints

```
POST   /api/v1/word-audio/resolve        → resolve single word
POST   /api/v1/word-audio/batch-resolve   → resolve multiple words
GET    /api/v1/word-audio/:id             → get word audio by ID
GET    /api/v1/word-audio/lookup?text=&lang=  → lookup by normalized text
```

#### Acceptance criteria

- [ ] `POST /word-audio/resolve` accepts `{ text, language? }` and returns `WordAudioResolveResponse`
- [ ] `POST /word-audio/batch-resolve` accepts `{ words: [{text, language?}] }` with max 50 words per request
- [ ] `GET /word-audio/:id` returns a single `WordAudio` record
- [ ] `GET /word-audio/lookup` accepts `text` and `lang` query params and returns the matching record or 404
- [ ] All endpoints require authentication (JWT)
- [ ] Rate limiting: 100 resolve calls per minute per user, 10 batch-resolve calls per minute
- [ ] Batch endpoint returns partial results if some generations fail (does not fail the whole batch)

---

### LC-WA05 · Refactor `/ai/pronunciation` → use WordAudioService

**Phase:** 1 — Backend
**Points:** 3
**Depends on:** WA03

#### User story

As a developer, I want the existing `/ai/pronunciation` endpoint to use the new `WordAudioService` internally so that all audio generation goes through the global registry, even for clients that haven't been updated yet.

#### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/ai/ai.controller.ts` | `pronunciation()` method delegates to `WordAudioService.resolve()` |
| `apps/api/src/ai/ai.module.ts` | Import `WordAudioModule` |

#### Implementation

```typescript
// ai.controller.ts — updated pronunciation method
@Post('pronunciation')
async pronunciation(@Body() dto: PronunciationRequestDto, @Res() res: Response): Promise<void> {
  try {
    // Build the text the same way the client does
    const text = dto.text;
    const language = dto.language ?? 'de-DE';

    // Delegate to the global word audio registry
    const result = await this.wordAudioService.resolve(text, language);

    // Return the same response shape for backward compatibility
    res.json({
      audioUrl: result.wordAudio.audioUrl,
      durationMs: result.wordAudio.durationMs,
      wordAudioId: result.wordAudio.id,  // new field — clients can start using this
      cached: result.cached,
    });
  } catch (err) {
    this.handleTtsError(err, res);
  }
}
```

#### Acceptance criteria

- [ ] Existing `/ai/pronunciation` endpoint continues to work with the same request/response shape
- [ ] Response now includes `wordAudioId` and `cached` fields (backward-compatible additions)
- [ ] Two calls with different `cardId` but same `text` result in one TTS generation
- [ ] Old R2 path `pronunciation/{cardId}.wav` is no longer written to — new path is `word-audio/{hash}.wav`
- [ ] `/ai/tts` endpoint (ephemeral, no persistence) remains unchanged
- [ ] Integration test: call `/ai/pronunciation` with `{ cardId: "card-1", text: "der Hund" }` then `{ cardId: "card-2", text: "der Hund" }` — second call returns `cached: true`

---

### LC-WA06 · WordAudioService (Angular) — resolution + device cache

**Phase:** 2 — Angular
**Points:** 5
**Depends on:** WA04

#### User story

As the mobile app, I want a `WordAudioService` that resolves audio by word text (not card ID) and caches results on device, so that audio loads instantly after the first generation regardless of which card or feature requests it.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/shared/audio/word-audio.service.ts` | Core resolution service |
| `apps/mobile/src/app/shared/audio/word-audio-api.service.ts` | HTTP client for word-audio endpoints |
| `apps/mobile/src/app/shared/audio/normalize.ts` | Client-side normalization (matches backend) |

#### Architecture decision: `shared/audio/` not `features/ai/audio/`

The word audio service is consumed by vault, review, listen, stories, and any future feature that plays word pronunciation. Per the architecture rule ("Is this used by 2+ features? → shared/"), it belongs in `shared/audio/`.

#### Service implementation

```typescript
@Injectable({ providedIn: 'root' })
export class WordAudioService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService);

  // In-memory: normalizedKey → audioUrl
  private readonly _urlMap = new Map<string, string>();
  private readonly _inflight = new Map<string, Promise<string | null>>();
  private _rateLimitedUntil = 0;

  readonly isLoading = signal(false);

  /**
   * Play pronunciation for a word. The audio is resolved by normalized text,
   * not by card ID — so "der Hund" resolves to the same audio regardless
   * of which card or feature requests it.
   */
  async play(text: string, language = 'de-DE'): Promise<void> {
    const url = await this.resolveUrl(text, language);
    if (url) {
      new Audio(url).play();
    } else {
      this.fallback.speak(text, language, 0.85).subscribe();
    }
  }

  /** Play and wait for completion. Used by ListenStore. */
  async playAsPromise(text: string, language = 'de-DE'): Promise<void> {
    const url = await this.resolveUrl(text, language);
    if (url) {
      return this._playAndWait(url);
    }
    return new Promise(resolve => {
      this.fallback.speak(text, language, 0.85).subscribe({
        complete: resolve, error: resolve,
      });
    });
  }

  /** Convenience: play a card's word. */
  async playCard(card: Card): Promise<void> {
    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    await this.play(text, 'de-DE');
  }

  /**
   * Pre-warm: resolve audio URLs for a batch of words without playing.
   * Used after card creation or import to trigger generation in background.
   */
  async preWarm(words: { text: string; language?: string }[]): Promise<void> {
    // Call batch-resolve endpoint; populate _urlMap with results
  }

  /** Resolution: memory → device cache → API → null (fallback) */
  async resolveUrl(text: string, language = 'de-DE'): Promise<string | null> {
    const normalized = normalizeForAudio(text, language);
    const cacheKey = `wa-${language}-${normalized}`;

    // 1. In-memory
    if (this._urlMap.has(cacheKey)) return this._urlMap.get(cacheKey)!;

    // 2. Device cache
    const deviceCached = await this.cache.getFromCache(cacheKey);
    if (deviceCached) {
      this._urlMap.set(cacheKey, deviceCached);
      return deviceCached;
    }

    // 3. Rate limit check
    if (Date.now() < this._rateLimitedUntil) return null;

    // 4. Deduplicate inflight
    if (this._inflight.has(cacheKey)) return this._inflight.get(cacheKey)!;

    const request = this._fetchAndCache(text, language, cacheKey);
    this._inflight.set(cacheKey, request.finally(() => this._inflight.delete(cacheKey)));
    return request;
  }
}
```

#### Acceptance criteria

- [ ] `WordAudioService` lives in `shared/audio/` and is `providedIn: 'root'`
- [ ] `resolveUrl()` uses normalized text as cache key, not cardId
- [ ] Two calls with `"der Hund"` and `"Der Hund."` resolve to the same cache entry
- [ ] Device cache key format: `wa-{language}-{normalizedText}`
- [ ] `preWarm()` calls `POST /word-audio/batch-resolve` and populates the in-memory map
- [ ] `playCard(card)` builds text from `article + back` and delegates to `play()`
- [ ] Rate limiting: respects `Retry-After` / 429 from backend
- [ ] Inflight dedup: concurrent calls for same word share one Promise
- [ ] Unit test: `resolveUrl("der Hund")` after `resolveUrl("der Hund")` makes only one API call

---

### LC-WA07 · Refactor PronunciationService → WordAudioService

**Phase:** 2 — Angular
**Points:** 3
**Depends on:** WA06

#### User story

As a developer, I want `PronunciationService` to delegate to `WordAudioService` so that all pronunciation goes through the global registry without changing every consumer at once.

#### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/ai/audio/pronunciation.service.ts` | Delegate to `WordAudioService`; deprecate cardId-based methods |

#### Implementation approach

Rather than immediately rewriting all consumers, `PronunciationService` becomes a thin wrapper:

```typescript
@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly wordAudio = inject(WordAudioService);

  readonly isLoading = this.wordAudio.isLoading;

  /** @deprecated Use WordAudioService.playCard() directly */
  async play(card: Card): Promise<void> {
    return this.wordAudio.playCard(card);
  }

  /** @deprecated Use WordAudioService.play() directly */
  async playText(text: string, language = 'de-DE', _cardId?: string): Promise<void> {
    return this.wordAudio.play(text, language);
  }

  /** @deprecated Use WordAudioService.playAsPromise() directly */
  async playTextAsPromise(text: string, language = 'de-DE', _cardId?: string): Promise<void> {
    return this.wordAudio.playAsPromise(text, language);
  }
}
```

#### Acceptance criteria

- [ ] `PronunciationService.play(card)` delegates to `WordAudioService.playCard(card)`
- [ ] `PronunciationService.playText(text, lang, cardId)` ignores `cardId` and delegates to `WordAudioService.play(text, lang)`
- [ ] `PronunciationService.playTextAsPromise()` delegates similarly
- [ ] All existing consumers continue to work without code changes
- [ ] `PronunciationService` methods marked `@deprecated` with JSDoc pointing to `WordAudioService`
- [ ] `isLoading` signal forwarded from `WordAudioService`
- [ ] The old `_urlMap` keyed by cardId, `_inflight` map, and `_rateLimitedUntil` are removed (now in `WordAudioService`)

---

### LC-WA08 · Wire all audio consumers to new service

**Phase:** 2 — Angular
**Points:** 3
**Depends on:** WA07

#### User story

As a developer, I want all audio playback consumers updated to use `WordAudioService` directly (bypassing the deprecated `PronunciationService`) so the codebase is clean and consistent.

#### Files to modify

| File | Change |
|------|--------|
| `word-detail.component.ts` | `WordAudioService.playCard(card)` |
| `review.page.ts` | `WordAudioService.playCard(card)` |
| `listen.store.ts` | `WordAudioService.playAsPromise(text, lang)` — remove cardId param |
| `story-reader.page.ts` | `WordAudioService.play(keyword.german)` — no more cardId check |
| `collection-detail.page.ts` | `WordAudioService.playCard(card)` |
| `word-card.component.ts` | Parent components pass card; use `WordAudioService.playCard()` |

#### Key change in `listen.store.ts`

```typescript
// Before:
private _speakPromise(text: string, lang: string, _rate: number, cardId?: string): Promise<void> {
  if (lang === 'de-DE') {
    return this.pronunciation.playTextAsPromise(text, 'de-DE', cardId);
  }
  // ...
}

// After:
private _speakPromise(text: string, lang: string, _rate: number): Promise<void> {
  if (lang === 'de-DE') {
    return this.wordAudio.playAsPromise(text, 'de-DE');
  }
  // ...
}
```

#### Key change in `story-reader.page.ts`

```typescript
// Before:
onKeywordsPlayWord(keyword: StoryKeyword): void {
  const text = keyword.german || keyword.germanBase;
  void this.pronunciation.playText(text, 'de-DE', keyword.cardId ?? undefined);
}

// After:
onKeywordsPlayWord(keyword: StoryKeyword): void {
  const text = keyword.german || keyword.germanBase;
  void this.wordAudio.play(text, 'de-DE');
  // No cardId needed — audio is resolved by text
}
```

#### Acceptance criteria

- [ ] All 6 consumer files inject `WordAudioService` from `shared/audio/` instead of `PronunciationService`
- [ ] `PronunciationService` is no longer injected anywhere (can be removed in follow-up)
- [ ] Story keywords without `cardId` now get persisted audio (not ephemeral object URLs)
- [ ] Listen playlist German words use persisted audio (all modes: word-meaning, examples-only, deep-dive)
- [ ] Review auto-play uses `WordAudioService.playCard()`
- [ ] No feature imports from `features/ai/audio/` — all go through `shared/audio/`

---

### LC-WA09 · Backend word deduplication check endpoint

**Phase:** 3 — Dedup
**Points:** 3
**Depends on:** WA01

#### User story

As the mobile app, I want to check whether a word already exists in my vault before creating it, so I can warn the user and avoid duplicates.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/cards/word-dedup.service.ts` | Deduplication logic |

#### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/cards/cards.controller.ts` | Add dedup check endpoints |
| `apps/api/src/cards/cards.service.ts` | Add `findDuplicates()` method |

#### Endpoints

```
POST /api/v1/cards/check-duplicates
Body: { words: [{ back: string, article?: string }] }
Response: {
  duplicates: [{
    input: { back: string, article: string | null },
    existingCard: { id, back, article, collectionId, collectionName } | null
  }]
}
```

#### Deduplication algorithm

```typescript
async findDuplicates(
  userId: string,
  words: { back: string; article?: string | null }[]
): Promise<DuplicateCheckResult[]> {
  // 1. Normalize all input words
  const normalized = words.map(w => ({
    original: w,
    key: this.normalizeWord(w.back, w.article ?? null),
  }));

  // 2. Batch query: find all user's cards where normalized back matches
  const allCards = await this.repo.createQueryBuilder('card')
    .where('card.userId = :userId', { userId })
    .getMany();

  // 3. Build lookup map: normalizedKey → Card
  const existingMap = new Map<string, CardEntity>();
  for (const card of allCards) {
    const key = this.normalizeWord(card.content.back, card.content.article);
    if (!existingMap.has(key)) existingMap.set(key, card);
  }

  // 4. Check each input word
  return normalized.map(n => ({
    input: n.original,
    existingCard: existingMap.get(n.key) ?? null,
  }));
}

private normalizeWord(back: string, article: string | null): string {
  const word = back.toLowerCase().trim();
  const art = article?.toLowerCase().trim() ?? '';
  return art ? `${art} ${word}` : word;
}
```

#### Acceptance criteria

- [ ] `POST /cards/check-duplicates` accepts up to 200 words and returns duplicate matches
- [ ] Matching is case-insensitive and whitespace-normalized
- [ ] Article is included in matching: `"der Hund"` ≠ `"die Hund"` (different gender = different word)
- [ ] Verbs and adjectives (no article) match by `back` alone
- [ ] Response includes the existing card's `id`, `collectionId`, and collection name for context
- [ ] Endpoint requires authentication; only checks the authenticated user's cards
- [ ] Performance: < 200ms for a user with 1000 cards checking 50 words

---

### LC-WA10 · Add-word sheet: duplicate warning UX

**Phase:** 3 — Dedup
**Points:** 2
**Depends on:** WA09

#### User story

As a user adding a new word, I want to be warned if the word already exists in my vault so I can decide whether to add it again or skip it.

#### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/components/add-word-sheet/add-word-sheet.component.ts` | Add debounced duplicate check on `back` field blur |
| `apps/mobile/src/app/features/vault/components/add-word-sheet/add-word-sheet.component.html` | Show warning banner when duplicate found |

#### UX behavior

1. User types a German word in the "back" field and tabs/blurs away
2. Debounced (300ms) call to `POST /cards/check-duplicates` with `[{ back, article }]`
3. If duplicate found, show an amber warning below the field:

```
⚠ "der Hund" already exists in "Chapter 6 — Restaurant"
  [Add anyway]  [Go to existing]
```

4. "Add anyway" dismisses the warning and allows creation
5. "Go to existing" dismisses the sheet and navigates to the existing card's detail page

#### Acceptance criteria

- [ ] Duplicate check fires on blur of the `back` field (not on every keystroke)
- [ ] Check includes the current article selection
- [ ] Warning banner shows existing card's collection name
- [ ] "Add anyway" allows the user to proceed — this is a warning, not a block
- [ ] "Go to existing" navigates to `/vault/word/{existingCardId}` and dismisses the sheet
- [ ] If article changes after the check, a new check fires
- [ ] No check fires if `back` field is empty
- [ ] Loading state while check is in-flight (subtle spinner, not blocking)

---

### LC-WA11 · Import flows: batch duplicate detection & warning

**Phase:** 3 — Dedup
**Points:** 3
**Depends on:** WA09

#### User story

As a user importing words via CSV or image, I want to see which words already exist in my vault so I can deselect duplicates before importing.

#### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/vault/import/pages/import-review/import-review.page.ts` | Check for duplicates after parse, mark rows |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Same for image import |

#### UX behavior

1. After CSV/image parsing produces the word list, call `POST /cards/check-duplicates` with all words
2. Rows that are duplicates get a new status indicator: an amber "Duplicate" badge with the existing collection name
3. Duplicates are **deselected by default** (user can re-select if they want)
4. Summary at top: "3 of 15 words already in your vault (deselected)"

#### Within-batch dedup

Additionally, check for duplicates **within the import batch itself** — if the CSV has "Hund" twice, flag the second occurrence:

```typescript
// Within-batch dedup
const seen = new Map<string, number>();
rows.forEach((row, i) => {
  const key = normalizeWord(row.back, row.article);
  if (seen.has(key)) {
    row.status = 'warning';
    row.warningMessages.push(`Duplicate of row ${seen.get(key)! + 1} in this import`);
  } else {
    seen.set(key, i);
  }
});
```

#### Acceptance criteria

- [ ] CSV import review page checks all parsed words against existing vault
- [ ] Image import review page checks all extracted words against existing vault
- [ ] Duplicate rows show amber "Duplicate" badge with collection name of existing card
- [ ] Duplicate rows are deselected by default
- [ ] User can manually re-select duplicates if they want them
- [ ] Within-batch duplicates are also detected and warned
- [ ] Summary line shows count of duplicates found
- [ ] If all words are duplicates, CTA button still works (user might re-select some)
- [ ] Performance: dedup check completes in < 1s for 50-word imports

---

### LC-WA12 · Data migration: existing card audio → word_audio registry

**Phase:** 4 — Migration
**Points:** 5
**Depends on:** WA03, WA05

#### User story

As a developer, I want to migrate all existing card pronunciation audio from the `pronunciation/{cardId}.wav` R2 paths into the new `word_audio` registry so that existing users benefit from deduplication immediately.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/migration/migrate-card-audio.ts` | One-time migration script |

#### Migration algorithm

```
1. Query all cards that have had pronunciation generated
   (infer from R2: list all objects under pronunciation/ prefix)

2. For each pronunciation/{cardId}.wav:
   a. Look up the card to get (article, back, language)
   b. Normalize the text
   c. Check if word_audio row already exists for this normalized text
      - Yes → skip (another card's audio already covers this word)
      - No  → copy the R2 file to word-audio/{hash}.wav
              insert word_audio row with status='ready'

3. Log summary: {total_files, unique_words, duplicates_found, copied, skipped}
```

#### Acceptance criteria

- [ ] Migration script is idempotent (safe to run multiple times)
- [ ] Existing R2 files under `pronunciation/` are **copied** (not moved) to `word-audio/` — old paths remain until LC-WA13
- [ ] `word_audio` table is populated with one row per unique word
- [ ] Cards with identical words share the same `word_audio` record
- [ ] Migration logs a summary report
- [ ] Dry-run mode: `--dry-run` flag shows what would happen without making changes
- [ ] Handles cards with null `back` or missing content gracefully (skips with warning)

---

### LC-WA13 · R2 cleanup: deduplicate storage, remove orphaned files

**Phase:** 4 — Migration
**Points:** 3
**Depends on:** WA12

#### User story

As an operator, I want to remove duplicate and orphaned audio files from R2 so we stop paying for redundant storage.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/migration/cleanup-r2.ts` | Cleanup script |

#### Cleanup steps

1. **Remove old pronunciation paths:** After confirming migration is complete, delete `pronunciation/{cardId}.wav` files that have been migrated to `word-audio/`
2. **Find orphans:** List all `word-audio/` files in R2, cross-reference with `word_audio` table. Delete files not referenced by any row.
3. **Find zombies:** Query `word_audio` rows with `status='ready'` whose `storage_path` file doesn't exist in R2. Mark as `status='failed'` for re-generation.

#### Acceptance criteria

- [ ] Script lists old pronunciation files and confirms before deletion
- [ ] Orphaned files in R2 are identified and removed
- [ ] Zombie DB rows (pointing to missing files) are flagged
- [ ] Report: `{old_files_deleted, orphans_removed, zombies_flagged, storage_saved_mb}`
- [ ] `--dry-run` mode available
- [ ] Script requires explicit `--confirm` flag to actually delete

---

### LC-WA14 · Batch pre-generation: generate audio on card creation

**Phase:** 5 — Polish
**Points:** 2
**Depends on:** WA03

#### User story

As a user, I want audio for my new words to be ready immediately after I add them, so I don't have to wait for generation when I first tap the play button.

#### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/cards/cards.service.ts` | After `create()`, trigger async audio generation |
| `apps/api/src/cards/cards.controller.ts` | Bulk import endpoint triggers batch audio generation |

#### Implementation

```typescript
// cards.service.ts
async create(userId: string, dto: CreateCardDto): Promise<Card> {
  const entity = /* existing creation logic */;
  const saved = await this.repo.save(entity);

  // Fire-and-forget: pre-generate audio for the new word
  const text = (dto.content.article ? `${dto.content.article} ` : '') + dto.content.back;
  this.wordAudioService.resolve(text, 'de-DE').catch(err => {
    this.logger.warn(`Pre-generation failed for "${text}":`, err);
  });

  return this.toModel(saved);
}
```

#### Acceptance criteria

- [ ] Audio generation is triggered asynchronously after card creation (does not slow down the API response)
- [ ] Bulk import triggers `batchResolve()` for all imported words after cards are created
- [ ] If audio already exists (from a previous card with the same word), no TTS call is made
- [ ] Generation failure does not affect card creation success
- [ ] Pre-generated audio is immediately available when user navigates to the word and taps play

---

### LC-WA15 · Audio generation status UI

**Phase:** 5 — Polish
**Points:** 2
**Depends on:** WA06

#### User story

As a user, I want to see whether audio is ready for a word, so I know if I'll hear AI pronunciation or a browser fallback.

#### Files to modify

| File | Change |
|------|--------|
| `word-detail.component.ts` | Show audio status indicator next to play button |
| `word-card.component.ts` | Subtle indicator on play button (ready vs pending) |

#### UX

- Play button shows a small dot indicator:
  - Green dot: AI audio ready (cached)
  - No dot: not yet generated (will generate on first tap)
  - Amber dot: generation in progress
- After first play (which triggers generation), the dot turns green for subsequent visits

#### Acceptance criteria

- [ ] Word detail page shows audio readiness status
- [ ] Word card component shows subtle status indicator
- [ ] Status updates reactively after audio generation completes
- [ ] No API call just to check status — inferred from local cache presence

---

### LC-WA16 · Analytics: audio cache hit rate & generation cost tracking

**Phase:** 5 — Polish
**Points:** 2
**Depends on:** WA06

#### User story

As a developer, I want to track audio cache hit rates and generation costs so I can measure the impact of the word audio registry on TTS costs.

#### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/word-audio/word-audio-analytics.service.ts` | Track generation vs reuse counts |

#### Metrics to track

| Metric | Description |
|--------|-------------|
| `word_audio.resolve.total` | Total resolve() calls |
| `word_audio.resolve.cache_hit` | Resolved from existing DB record (no TTS) |
| `word_audio.resolve.generated` | New TTS generation triggered |
| `word_audio.resolve.failed` | Generation failed |
| `word_audio.batch.total` | Total batch-resolve calls |
| `word_audio.batch.cache_hit_rate` | Percentage of words in batch that were cached |
| `word_audio.storage.total_files` | Total files in R2 word-audio/ prefix |
| `word_audio.storage.total_bytes` | Total storage used |

#### Acceptance criteria

- [ ] Metrics are logged on every `resolve()` and `batchResolve()` call
- [ ] `GET /api/v1/word-audio/stats` returns aggregated metrics for the last 30 days
- [ ] Stats include: total unique words, total generations, cache hit rate, estimated cost savings
- [ ] Logging is fire-and-forget (no performance impact on audio resolution)

---

## 7 · Implementation Order

Work through these in exactly this sequence to avoid blocked dependencies:

```
Phase 0:  LC-WA01  Domain types                          ┐
Phase 1:  LC-WA02  Entity + migration                    │ Backend
          LC-WA03  WordAudioService                      │ foundation
          LC-WA04  API endpoints                         │
          LC-WA05  Refactor /ai/pronunciation             ┘
Phase 2:  LC-WA06  Angular WordAudioService              ┐
          LC-WA07  Refactor PronunciationService          │ Client
          LC-WA08  Wire all consumers                     ┘ migration
Phase 3:  LC-WA09  Dedup check endpoint                  ┐
          LC-WA10  Add-word sheet warning                 │ Dedup
          LC-WA11  Import flows warning                   ┘
Phase 4:  LC-WA12  Data migration script                 ┐ Migration
          LC-WA13  R2 cleanup                             ┘
Phase 5:  LC-WA14  Pre-generation on create              ┐
          LC-WA15  Audio status UI                        │ Polish
          LC-WA16  Analytics                              ┘
Phase 6:  LC-SA01  Example sentence audio — listen       ┐ Sentence
          LC-SA02  Pre-warm sentences on load             ┘ audio
```

Phases 3 (dedup) and 4 (migration) can run in parallel with Phase 2 since they touch different parts of the codebase. Phase 5 can start as soon as Phases 1+2 are complete. Phase 6 (sentence audio) can start as soon as Phase 2 is complete — no backend changes required.

---

## 6b · Sentence Audio Stories

---

### LC-SA01 · Example sentence audio — Listen playlist

**Phase:** 6 — Sentences
**Points:** 3
**Depends on:** WA08

#### User story

As a user, I want German example sentences in the listen playlist (Examples and Deep Dive modes) to use AI audio — not browser Web Speech — so that the pronunciation is consistent and natural, matching the same quality as individual word audio.

#### Background

The word audio registry (`WordAudioService`) already accepts arbitrary text — it normalizes, hashes, generates once, and caches forever. Example sentences are just longer strings. The only change needed is in the listen store's `_speakPromise()`: German example sentences currently go to `AudioService.speak()` (Web Speech). They should go to `WordAudioService.playAsPromise()` instead.

#### File to modify

`apps/mobile/src/app/features/listen/store/listen.store.ts`

#### Change in `_buildUtterances()`

Replace the implicit `cardId`-presence discriminator with an explicit `useAi: boolean` flag on the `Utterance` type. All German utterances — words and sentences — get `useAi: true`. English translations stay as Web Speech.

```typescript
// Utterance type — add useAi flag
interface Utterance {
  text: string;
  lang: string;
  rate: number;
  useAi: boolean;  // true = route through WordAudioService; false = Web Speech only
}

// _buildUtterances() — mark all de-DE utterances with useAi: true
// Word
{ text: wordText, lang: 'de-DE', rate: 1.0, useAi: true }
// Translation
{ text: card.content.front, lang: 'en-US', rate: 1.0, useAi: false }
// Example (German)
{ text: example.target, lang: 'de-DE', rate: 0.9, useAi: true }
// Example (English)
{ text: example.native, lang: 'en-US', rate: 1.0, useAi: false }
```

#### Change in `_speakPromise()`

```typescript
// Before — implicit: de-DE → AI, else Web Speech
private _speakPromise(text: string, lang: string, rate: number, cardId?: string): Promise<void> {
  if (lang === 'de-DE') return this.wordAudio.playAsPromise(text, 'de-DE');
  return new Promise(resolve => {
    this.audio.speak(text, lang, rate).subscribe({ complete: resolve, error: resolve });
  });
}

// After — explicit: useAi flag drives routing, no ambiguity
private _speakPromise(utt: Utterance): Promise<void> {
  if (utt.useAi) return this.wordAudio.playAsPromise(utt.text, utt.lang);
  return new Promise(resolve => {
    this.audio.speak(utt.text, utt.lang, utt.rate).subscribe({ complete: resolve, error: resolve });
  });
}
```

#### Why this works without backend changes

`WordAudioService.playAsPromise()` calls `POST /word-audio/resolve` with any text. The backend normalizes (`"Der Betreff der Mail ist sehr wichtig."` → `"der betreff der mail ist sehr wichtig"`), derives a SHA-256 hash, generates Gemini TTS once, uploads to R2, and stores the URL. On second play the URL is returned from the DB — no TTS call. The 1500ms timeout in `playAsPromise()` ensures the playlist never hangs — if the sentence isn't cached yet, Web Speech plays immediately while generation runs in the background.

#### Acceptance criteria

- [ ] German example sentences in Examples mode use AI audio on second play (first play gets Web Speech while generation runs in background)
- [ ] German example sentences in Deep Dive mode use AI audio on second play
- [ ] English translations continue using Web Speech regardless of mode
- [ ] Playlist never hangs — the existing 1500ms timeout in `playAsPromise()` still applies
- [ ] Individual word utterances are unaffected (still route through `wordAudio.playAsPromise()` as before)
- [ ] `_speakPromise()` no longer takes a `cardId` parameter — all routing via `useAi` flag

---

### LC-SA02 · Pre-warm sentences on playlist load

**Phase:** 6 — Sentences
**Points:** 2
**Depends on:** SA01

#### User story

As a user, I want AI audio for all words and example sentences in a listen playlist to be generated in the background as soon as I load the playlist, so that by the time I reach each card, the audio is already cached and plays instantly.

#### Background

`WordAudioService.preWarm()` accepts a list of `{ text, language? }` objects and calls `POST /word-audio/batch-resolve` in the background. Currently `loadPlaylist()` does not call `preWarm()`. Adding this call means every card's word AND example sentence starts generating immediately, rather than waiting for the user to reach that card in the sequence.

#### File to modify

`apps/mobile/src/app/features/listen/store/listen.store.ts`

#### Change in `loadPlaylist()`

```typescript
loadPlaylist(cards: Card[], label: string): void {
  this.pause();
  this._queue.set([...cards]);
  this._currentIndex.set(0);
  this._activeSourceLabel.set(label);

  // Pre-warm AI audio for all German text in the playlist (words + example sentences).
  // Fire-and-forget — preWarm() swallows errors internally.
  const texts = cards.flatMap(c => {
    const word = c.content.article
      ? `${c.content.article} ${c.content.back}`
      : c.content.back;
    const sentence = c.content.examples?.[0]?.target;
    return sentence
      ? [{ text: word }, { text: sentence }]
      : [{ text: word }];
  });
  void this.wordAudio.preWarm(texts);
}
```

#### Why only the first example sentence

The listen player uses only `examples[0]` per card in its utterance queue. Pre-warming all examples would trigger unnecessary TTS for sentences the user may never hear in a session. If the player is later extended to cycle through multiple examples, this pre-warm should be updated to match.

#### Acceptance criteria

- [ ] `loadPlaylist()` calls `wordAudio.preWarm()` with all German words and first example sentences in the queue
- [ ] `preWarm()` call is fire-and-forget — a failure does not prevent the playlist from starting
- [ ] Cards without any example sentence still contribute their word text to the pre-warm batch
- [ ] Pre-warm uses the same normalization as playback — no duplicate generations
- [ ] On second session load with the same playlist, all audio resolves from device/memory cache (pre-warm exits fast via DB hit)

---

## 8 · Architecture Decisions

### ADR-1: Audio keyed by normalized text, not by cardId

**Context:** The current system keys audio by `cardId`, causing duplicate generation for identical words across cards.

**Decision:** Key audio by `normalize(text) + language`. A deterministic normalization function ensures "der Hund", "Der Hund", and "der Hund." all resolve to the same audio.

**Consequence:** Massive reduction in TTS calls and R2 storage. Existing `pronunciation/{cardId}.wav` paths become legacy and are migrated.

### ADR-2: Per-user audio registry (not global)

**Context:** Words sound identical regardless of which user added them. A global registry would allow cross-user sharing.

**Decision:** Keep the registry per-user for now. Cross-user sharing raises questions about billing (who pays for the generation?), privacy (should user A know user B has the same word?), and multi-tenancy.

**Consequence:** Some redundancy across users. This can be revisited when implementing community decks (Epic 11), where shared audio is a natural fit.

### ADR-3: WordAudioService in `shared/audio/`, not `features/ai/audio/`

**Context:** `PronunciationService` currently lives in `features/ai/audio/`. The architecture rule says "Is this used by 2+ features? → shared/".

**Decision:** `WordAudioService` goes to `shared/audio/`. `PronunciationService` stays in `features/ai/audio/` as a deprecated wrapper during migration.

**Consequence:** Clean dependency graph. No feature-to-feature imports. The `shared/audio/` folder becomes the single home for all audio-related services.

### ADR-4: Soft deduplication (warn, don't block)

**Context:** Should we prevent users from creating duplicate words?

**Decision:** Warn users about duplicates but always allow them to proceed. A user might intentionally want the same word in multiple collections with different example sentences or notes.

**Consequence:** Dedup is advisory. The word audio registry handles the cost concern (same word = same audio regardless of card count), while the user retains full control over their vocabulary organization.

### ADR-5: Stories narration excluded from word audio

**Context:** Stories generate full-text TTS for karaoke highlighting. Could we splice word-level audio into sentences?

**Decision:** Exclude story narration from this epic. Audio splicing (concatenating word-level clips into fluent sentences) produces unnatural prosody and requires cross-fade algorithms. Full-sentence TTS remains the right approach for stories.

**Consequence:** Story keywords, quiz sections, and any "pronounce this word" interaction within stories DO use the word audio registry. Only the full narration audio remains separate.

### ADR-6: Example sentences use the same word audio registry (no separate system)

**Context:** The listen player's example sentences were originally deferred from the word audio epic (see scope boundaries). After Phase 2 was implemented, it became clear that the registry already handles arbitrary text — the only missing piece was the consumer routing sentences to `playAsPromise()` instead of `AudioService.speak()`.

**Decision:** Example sentences in the listen playlist are treated as first-class registry entries. No new backend infrastructure is needed. A sentence like `"Der Betreff der Mail ist sehr wichtig."` is normalized, hashed, generated once via Gemini TTS, stored in R2, and reused exactly like a single word. The `useAi: boolean` flag on `Utterance` replaces the implicit `lang === 'de-DE'` discriminator, making the routing explicit.

**Consequence:** Any German text string spoken by the listen player — word, phrase, or full sentence — benefits from AI audio and device caching after its first play. The normalized text length is bounded by the `normalizedText VARCHAR(500)` column, which is sufficient for all realistic example sentences.

**Out of scope:** Story full-text narration (karaoke audio) remains excluded per ADR-5. That audio is a different product — synchronized multi-sentence playback with word timestamps — and is generated as a single file, not sentence by sentence.

---

## 9 · Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Normalization mismatches between client and server | Medium | High — same word could generate twice | Pure function in shared lib; extensive unit tests with edge cases (umlauts, ß, compound words) |
| Migration corrupts existing audio | Low | High | Dry-run mode; copy-then-delete strategy; rollback plan (old files preserved until cleanup) |
| TTS API rate limits during batch pre-generation | Medium | Medium | Concurrency limit (5 parallel), exponential backoff, `status='failed'` with retry |
| Hash collisions in storage paths | Very low | Medium | SHA-256 first 16 chars = 2^64 space; practically collision-free at our scale |
| User confusion from duplicate warnings | Low | Low | Warnings are non-blocking; "Add anyway" is prominent; clear messaging about which collection has the existing word |

---

## 10 · Success Metrics

| Metric | Current | Target (30 days post-launch) |
|--------|---------|------|
| TTS calls per unique word | ~1.4 (due to duplicates) | 1.0 |
| R2 storage per user (audio) | ~500 files | ~350 files (30% reduction) |
| Audio cache hit rate | ~40% (in-memory only) | ~85% (normalized + device cache) |
| Time to first audio play (new word) | 1.5-3s (generate on tap) | < 500ms (pre-generated) |
| Duplicate cards per user (avg) | ~15% of vault | < 5% (with warnings) |
| Example sentence audio quality | Web Speech (variable) | AI audio on second play (after Phase 6) |
| Listen playlist pre-warm coverage | 0% | 100% of German text in queue (after LC-SA02) |
