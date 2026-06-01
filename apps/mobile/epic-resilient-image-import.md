# Epic: Resilient Two-Phase Image Import
## Extract-first, Enrich-later with Incomplete Collection Recovery

> **Epic Number:** LC-103 (continuing from LC-102)
> **Feature Areas:** `libs/shared/domain/`, `apps/api/src/import/`, `apps/api/src/collections/`, `apps/mobile/src/app/features/vault/import/`, `apps/mobile/src/app/features/vault/pages/collection-detail/`
> **Replaces:** Single-pass image → cards flow in `ImageImportService`
> **Ticket numbers:** LC-103 through LC-113
> **Design reference:** `design-reference-lc103-resilient-image-import.html` — open in browser before building any screen

---

## Screen Reference Map

| Screen ID | Route | Ticket(s) | Description |
|---|---|---|---|
| I01 | `/vault/import/image` | LC-085 (existing) | Image picker entry — camera / gallery buttons, tips |
| I02 | `/vault/import/image/processing` | LC-109 | Phase 1 active — scan animation over image thumbnail |
| I03 | `/vault/import/image/processing` | LC-109 | Phase 2 active — batched progress with word chips |
| I04 | `/vault/import/image/processing` | LC-109 | Partial result — rate limit hit, N of M cards ready |
| I05 | `/vault/import/image/review` | LC-087 (update) | Review words — partial badge, confirm import |
| I06 | `/vault/collections/:id` | LC-110 + LC-111 | Collection detail — incomplete banner + ghost rows |
| I07 | `/vault/collections` | LC-112 | Collections list — amber dot indicator on incomplete |

---

## Root Cause Analysis

The error log confirms exactly what is happening. The service calls `parseResponse()` on:

```
[
  { "back": "das Hobby, -s", ... },
  { "back": "das Buch, -¨er", ... },
  ...
```

The regex correctly strips any markdown fences. `JSON.parse()` then throws because the model hit its token/rate limit **mid-array**, returning 40+ objects without the closing `]`. The service logs `"Vision model returned non-JSON response"` and throws `InternalServerErrorException` — discarding all 40+ valid words it already had.

The **double waste** is:
1. The user loses the entire import even though the AI did 80% of the work
2. All tokens consumed generating those 40+ words are thrown away — the next retry pays the same cost from zero

---

## The Two-Phase Solution

**Phase 1 — Extract words only (vision call).** The AI looks at the image and returns the raw German words/phrases it can see, with articles. No translations, no example sentences, no category assignments. This is a tiny JSON response (~5–10 tokens per word) that rarely truncates.

**Phase 2 — Enrich words into cards (text call).** Given the extracted word list, generate translations, example sentences, and categories. This call is batched in small groups (10 words at a time) so a rate limit mid-batch saves the words already processed, not just the ones in the current batch.

**Incomplete collection.** After Phase 2, if some words were enriched and some were not (due to rate limit), the collection is saved with status `incomplete`. The collection detail page shows a banner with a "Complete import" action, which resumes Phase 2 only for the unenriched words.

---

## Data Model Changes

### New `Collection` status field

```typescript
// libs/shared/domain/src/index.ts

export type CollectionImportStatus = 'complete' | 'incomplete';

export interface Collection {
  // ... existing fields ...
  importStatus: CollectionImportStatus;      // ← new, default 'complete'
  pendingWords: RawExtractedWord[];          // ← new, empty when complete
  importedAt?: string;                       // ← new, ISO timestamp
  sourceImageDescription?: string;           // ← new, for UI display
}

export interface RawExtractedWord {
  back: string;         // German word as seen in image (e.g. "das Hobby, -s")
  article: ArticleType | null;
  rawText: string;      // Exactly as it appeared in the image
}
```

### New `POST /import/image/extract` endpoint (Phase 1)

Replaces `POST /import/image`. Returns only raw words — fast, cheap, rarely truncates.

```
POST /import/image/extract
Body: ImageImportRequest
Response 200: WordExtractionResult

interface WordExtractionResult {
  rawWords: RawExtractedWord[];   // just the words — no translations yet
  totalFound: number;
  imageDescription: string;
  processingMs: number;
  modelUsed: string;
}
```

### New `POST /import/enrich` endpoint (Phase 2)

Enriches a list of raw words into full card data. Processes in batches of 10.

```
POST /import/enrich
Body: EnrichWordsRequest
Response 200: EnrichWordsResult

interface EnrichWordsRequest {
  rawWords: RawExtractedWord[];
  targetLanguage: string;     // 'de'
  nativeLanguage: string;     // 'en'
  collectionId?: string;      // if enriching for an existing incomplete collection
  batchSize?: number;         // default 10
}

interface EnrichWordsResult {
  enriched: ImageExtractedWord[];   // successfully enriched
  pending: RawExtractedWord[];      // not yet processed (rate-limited)
  isComplete: boolean;              // true if pending is empty
}
```

### New `POST /import/complete/:collectionId` endpoint

Resumes enrichment for an incomplete collection.

```
POST /import/complete/:collectionId
Response 200: EnrichWordsResult
```

---

## Story Map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Domain | LC-103 | Extend domain types (Collection status, RawExtractedWord) | 2 |
| 1 — Backend | LC-104 | New Phase 1 endpoint: `POST /import/image/extract` | 3 |
| 1 — Backend | LC-105 | New Phase 2 endpoint: `POST /import/enrich` (batched) | 5 |
| 1 — Backend | LC-106 | New resume endpoint: `POST /import/complete/:collectionId` | 3 |
| 1 — Backend | LC-107 | Partial JSON recovery in `parseResponse()` | 2 |
| 2 — Mobile | LC-108 | Update `ImageImportApiService` for two-phase flow | 2 |
| 2 — Mobile | LC-109 | New processing screen: two-phase animated progress | 3 |
| 2 — Mobile | LC-110 | New incomplete collection banner on `CollectionDetailPage` | 2 |
| 2 — Mobile | LC-111 | "Complete import" resume flow | 3 |
| 3 — Polish | LC-112 | Incomplete collections indicator on collections list | 2 |
| 3 — Polish | LC-113 | Unit tests for batch enrichment and partial recovery | 2 |

**Total: 29 points**

---

---

## LC-103 · Extend domain types

**Epic:** Resilient Image Import
**Phase:** 0 — Do this first
**Points:** 2
**Depends on:** nothing

### Files to modify

| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Add `RawExtractedWord`, `WordExtractionResult`, `EnrichWordsRequest`, `EnrichWordsResult`, `CollectionImportStatus`; extend `Collection` |

### New types

```typescript
// ─── RESILIENT IMAGE IMPORT ──────────────────────────────────────────────────

export type CollectionImportStatus = 'complete' | 'incomplete';

/** A word exactly as seen in the image — no translation yet */
export interface RawExtractedWord {
  back: string;              // German word as seen (e.g. "das Hobby, -s")
  article: ArticleType | null;
  rawText: string;           // Verbatim text from image
}

/** Phase 1 response — just the raw words, no enrichment */
export interface WordExtractionResult {
  rawWords: RawExtractedWord[];
  totalFound: number;
  imageDescription: string;
  processingMs: number;
  modelUsed: string;
}

/** Phase 2 request — enrich raw words into full card data */
export interface EnrichWordsRequest {
  rawWords: RawExtractedWord[];
  targetLanguage: string;
  nativeLanguage: string;
  collectionId?: string;
  batchSize?: number;
}

/** Phase 2 response — what was enriched vs what is still pending */
export interface EnrichWordsResult {
  enriched: ImageExtractedWord[];
  pending: RawExtractedWord[];
  isComplete: boolean;
}
```

### Extend `Collection`

```typescript
export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  emoji: string;
  colour: string;
  contextId: string;
  cardCount: number;
  masteredCount: number;
  dueCount: number;
  isDefault: boolean;
  importStatus: CollectionImportStatus;    // ← new, default 'complete'
  pendingWords: RawExtractedWord[];        // ← new, [] when complete
  sourceImageDescription?: string;         // ← new
  createdAt: string;
  updatedAt: string;
}
```

### Extend `CollectionEntity` (NestJS)

```typescript
// apps/api/src/collections/collection.entity.ts
@Column({ type: 'varchar', default: 'complete' })
importStatus: string;

@Column({ type: 'jsonb', default: '[]' })
pendingWords: RawExtractedWord[];

@Column({ type: 'varchar', nullable: true })
sourceImageDescription: string | null;
```

### Acceptance criteria

- [ ] All new types exported from `libs/shared/domain/src/index.ts`
- [ ] `Collection` has `importStatus`, `pendingWords`, `sourceImageDescription`
- [ ] `CollectionEntity` has the three new DB columns
- [ ] Migration: `ALTER TABLE collections ADD COLUMN import_status VARCHAR DEFAULT 'complete'`
- [ ] Migration: `ALTER TABLE collections ADD COLUMN pending_words JSONB DEFAULT '[]'`
- [ ] `tsc --noEmit` passes across `apps/api` and `apps/mobile`

---

---

## LC-104 · Phase 1 endpoint: `POST /import/image/extract`

**Epic:** Resilient Image Import
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-103

### User story

As the mobile app, I want to POST an image and receive only the raw German words visible in it, without translations or example sentences, so that the Phase 1 response is small enough to never be truncated by rate limits.

### The key insight

The current `ImageImportPromptBuilder` asks for 6 fields per word (back, front, article, categoryName, exampleTarget, exampleNative). For a page with 50 words, that's ~300 fields of output — easily 3,000–4,000 tokens. The Phase 1 prompt asks only for `back` + `article` per word — about 20 tokens per word, so 1,000 tokens total for 50 words. This almost never truncates.

### Files to create / modify

| File | Change |
|---|---|
| `apps/api/src/import/import.controller.ts` | Add `POST /import/image/extract` route |
| `apps/api/src/import/image-extract.service.ts` | New — Phase 1 only |
| `apps/api/src/import/image-extract-prompt.builder.ts` | New — minimal prompt |

### Phase 1 prompt (minimal)

```typescript
// apps/api/src/import/image-extract-prompt.builder.ts
@Injectable()
export class ImageExtractPromptBuilder {
  build(dto: ImageImportRequest): string {
    return `
You are a language extraction assistant.
Look at the attached image and identify ALL ${dto.targetLanguage} words or phrases visible.

Return a JSON array. Each element must have ONLY these two fields:
- "back": the word or phrase EXACTLY as it appears (include article if visible, e.g. "der Hund")
- "article": "der", "die", "das", or null

Return ONLY the JSON array. No explanation. No markdown. No extra fields.
Example: [{"back": "der Hund", "article": "der"}, {"back": "laufen", "article": null}]
If no words are visible: []
`.trim();
  }
}
```

### `ImageExtractService`

```typescript
// apps/api/src/import/image-extract.service.ts
@Injectable()
export class ImageExtractService {
  constructor(
    private readonly openRouter: OpenRouterAdapter,
    private readonly gemini: GeminiAdapter,
    private readonly promptBuilder: ImageExtractPromptBuilder,
  ) {}

  async extractRawWords(dto: ImageImportRequest): Promise<WordExtractionResult> {
    const startMs = Date.now();
    const prompt = this.promptBuilder.build(dto);

    let rawText: string;
    let modelUsed: string;

    try {
      rawText = await this.openRouter.generateVision({
        imageBase64: dto.imageBase64,
        mimeType: dto.mimeType,
        prompt,
        maxTokens: 2048,  // Phase 1 only needs 2K max
      });
      modelUsed = 'google/gemma-4-26b-a4b-it:free';
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status !== 429 && status !== 503) throw err;
      rawText = await this.gemini.generateVisionLite({
        imageBase64: dto.imageBase64,
        mimeType: dto.mimeType,
        prompt,
        maxTokens: 2048,
      });
      modelUsed = 'gemini-2.5-flash-lite';
    }

    const rawWords = this.parseRawWords(rawText);

    return {
      rawWords,
      totalFound: rawWords.length,
      imageDescription: '',
      processingMs: Date.now() - startMs,
      modelUsed,
    };
  }

  private parseRawWords(raw: string): RawExtractedWord[] {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Partial recovery — extract all complete objects even if array is truncated
    const recovered = this.recoverPartialJson(cleaned);

    return recovered.map(item => ({
      back: String(item['back'] ?? ''),
      article: this.parseArticle(item['article']),
      rawText: String(item['back'] ?? ''),
    })).filter(w => w.back.length > 0);
  }

  private recoverPartialJson(raw: string): Record<string, unknown>[] {
    // Try full parse first
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Full parse failed — extract individual complete objects
      const results: Record<string, unknown>[] = [];
      const objectPattern = /\{[^{}]*\}/g;
      let match: RegExpExecArray | null;
      while ((match = objectPattern.exec(raw)) !== null) {
        try {
          const obj = JSON.parse(match[0]);
          if (typeof obj === 'object' && obj !== null) {
            results.push(obj as Record<string, unknown>);
          }
        } catch { /* skip malformed objects */ }
      }
      return results;
    }
  }

  private parseArticle(value: unknown): RawExtractedWord['article'] {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }
}
```

### Acceptance criteria

- [ ] `POST /import/image/extract` returns `WordExtractionResult` with `rawWords[]`
- [ ] Each `rawWord` has only `back`, `article`, `rawText` (no translations)
- [ ] Partial JSON recovery: if AI returns `[{"back":"Hund"},{"back":"Ka` (truncated), the service recovers `[{back:"Hund"}]`
- [ ] Falls back to Gemini Flash-Lite on OpenRouter 429/503
- [ ] Empty image returns 400 "No words detected"
- [ ] Phase 1 response is typically under 500 tokens even for 50-word images
- [ ] Unit test: `recoverPartialJson()` with truncated array returns all complete objects

---

---

## LC-105 · Phase 2 endpoint: `POST /import/enrich` (batched)

**Epic:** Resilient Image Import
**Phase:** 1 — Backend
**Points:** 5
**Depends on:** LC-103, LC-104

### User story

As the mobile app, I want to POST a list of raw German words and receive full card data (translations, examples, categories) processed in batches of 10, so that a rate limit mid-enrichment saves all previously processed words instead of discarding everything.

### Batch strategy

Words are processed in groups of 10. Each group is one API call. After each successful batch, its results are accumulated. On a 429 error, the service stops and returns what it has, marking the remaining words as `pending`. The caller gets both `enriched` and `pending` — it can save the enriched cards immediately and retry `pending` later.

### Files to create / modify

| File | Change |
|---|---|
| `apps/api/src/import/word-enrich.service.ts` | New — Phase 2 batched enrichment |
| `apps/api/src/import/word-enrich-prompt.builder.ts` | New — enrichment prompt for a batch of words |
| `apps/api/src/import/import.controller.ts` | Add `POST /import/enrich` route |

### Word enrichment prompt (per batch of 10)

```typescript
// apps/api/src/import/word-enrich-prompt.builder.ts
@Injectable()
export class WordEnrichPromptBuilder {
  build(words: RawExtractedWord[], targetLanguage: string, nativeLanguage: string): string {
    const wordList = words.map((w, i) => `${i + 1}. "${w.back}"`).join('\n');

    return `
You are a language learning assistant generating flashcard content.

WORDS TO ENRICH (${targetLanguage}):
${wordList}

For each word, return a JSON array. Each element must have:
- "back": the word EXACTLY as given above
- "front": the ${nativeLanguage} translation
- "article": "der", "die", "das", or null
- "categoryName": one of [Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other]
- "exampleTarget": a natural ${targetLanguage} sentence
- "exampleNative": ${nativeLanguage} translation of that sentence
- "confidence": 1.0

Return ONLY the JSON array. No markdown. No extra text.
`.trim();
  }
}
```

### `WordEnrichService`

```typescript
// apps/api/src/import/word-enrich.service.ts
const DEFAULT_BATCH_SIZE = 10;

@Injectable()
export class WordEnrichService {
  constructor(
    private readonly openRouter: OpenRouterAdapter,
    private readonly promptBuilder: WordEnrichPromptBuilder,
    private readonly logger: Logger,
  ) {}

  async enrichWords(dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    const batchSize = dto.batchSize ?? DEFAULT_BATCH_SIZE;
    const batches = this.chunk(dto.rawWords, batchSize);

    const enriched: ImageExtractedWord[] = [];
    let pendingStart = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const batchResult = await this.enrichBatch(batch, dto.targetLanguage, dto.nativeLanguage);
        enriched.push(...batchResult);
        pendingStart = (i + 1) * batchSize;
      } catch (err: unknown) {
        const status = (err as any)?.status;
        if (status === 429 || status === 503) {
          // Rate limited — stop and return what we have
          this.logger.warn(`Enrichment rate-limited after batch ${i} — ${enriched.length} words enriched, ${dto.rawWords.length - pendingStart} pending`);
          break;
        }
        // Non-rate-limit error on a batch — skip it, continue with next batch
        this.logger.error(`Batch ${i} enrichment failed`, err);
        pendingStart = (i + 1) * batchSize;
      }
    }

    const pending = dto.rawWords.slice(pendingStart);

    return {
      enriched,
      pending,
      isComplete: pending.length === 0,
    };
  }

  private async enrichBatch(
    words: RawExtractedWord[],
    targetLanguage: string,
    nativeLanguage: string,
  ): Promise<ImageExtractedWord[]> {
    const prompt = this.promptBuilder.build(words, targetLanguage, nativeLanguage);

    const result = await this.openRouter.generateText({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
    });

    return this.parseEnrichmentResponse(result.text);
  }

  private parseEnrichmentResponse(raw: string): ImageExtractedWord[] {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(item => ({
        front:        String(item['front'] ?? ''),
        back:         String(item['back']  ?? ''),
        article:      this.parseArticle(item['article']),
        categoryName: String(item['categoryName'] ?? 'Other'),
        exampleTarget: String(item['exampleTarget'] ?? ''),
        exampleNative: String(item['exampleNative'] ?? ''),
        confidence: typeof item['confidence'] === 'number' ? item['confidence'] : 1.0,
      }));
    } catch {
      return [];
    }
  }

  private parseArticle(value: unknown): ImageExtractedWord['article'] {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
```

### Acceptance criteria

- [ ] Words processed in batches of 10 (configurable via `batchSize`)
- [ ] On 429/503 mid-batch, returns enriched words so far + remaining as `pending`
- [ ] Non-rate-limit errors on a single batch are logged and skipped (don't abort all remaining batches)
- [ ] `isComplete: true` when all words were enriched
- [ ] `isComplete: false` when some words are pending
- [ ] Unit test: 25 words → 2 complete batches + 1 partial → correct split
- [ ] Unit test: 429 on batch 2 → returns 10 enriched, 15 pending

---

---

## LC-106 · Resume endpoint: `POST /import/complete/:collectionId`

**Epic:** Resilient Image Import
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-105

### User story

As the mobile app, when a user taps "Complete import" on an incomplete collection, I want to POST to resume enrichment of only the pending words, create the missing cards, update the collection's `pendingWords`, and return the updated status.

### Files to modify / create

| File | Change |
|---|---|
| `apps/api/src/import/import.controller.ts` | Add `POST /import/complete/:collectionId` |
| `apps/api/src/import/collection-complete.service.ts` | New — orchestrates resume flow |

### `CollectionCompleteService`

```typescript
// apps/api/src/import/collection-complete.service.ts
@Injectable()
export class CollectionCompleteService {
  constructor(
    private readonly wordEnrich: WordEnrichService,
    private readonly cardApi:    CardApiService,
    private readonly collectionRepo: Repository<CollectionEntity>,
  ) {}

  async resume(userId: string, collectionId: string): Promise<{
    newCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    const collection = await this.collectionRepo.findOneBy({ id: collectionId, userId });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.importStatus === 'complete') {
      return { newCards: 0, pendingWords: [], isComplete: true };
    }

    const pending = collection.pendingWords as RawExtractedWord[];
    if (pending.length === 0) {
      collection.importStatus = 'complete';
      await this.collectionRepo.save(collection);
      return { newCards: 0, pendingWords: [], isComplete: true };
    }

    const result = await this.wordEnrich.enrichWords({
      rawWords: pending,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      collectionId,
    });

    // Create cards for newly enriched words
    let newCards = 0;
    for (const word of result.enriched) {
      try {
        await this.cardApi.create(userId, collectionId, word);
        newCards++;
      } catch (err) {
        this.logger.error('Failed to create card during resume', err);
      }
    }

    // Update collection
    collection.pendingWords = result.pending;
    collection.importStatus = result.isComplete ? 'complete' : 'incomplete';
    await this.collectionRepo.save(collection);

    return {
      newCards,
      pendingWords: result.pending,
      isComplete: result.isComplete,
    };
  }
}
```

### Acceptance criteria

- [ ] `POST /import/complete/:collectionId` is JWT-protected
- [ ] Returns `{ newCards, pendingWords, isComplete }`
- [ ] If `isComplete: true`, sets `collection.importStatus = 'complete'` and `pendingWords = []`
- [ ] If `isComplete: false` (still rate-limited), updates `pendingWords` with remaining words
- [ ] Calling on an already-complete collection is a no-op (returns 200 with `newCards: 0`)
- [ ] Cards created for newly enriched words are added to the correct collection

---

---

## LC-107 · Partial JSON recovery in `parseResponse()`

**Epic:** Resilient Image Import
**Phase:** 1 — Backend (quick fix, do in parallel with LC-104)
**Points:** 2
**Depends on:** nothing

### Context

This is the direct fix for the logged error. The existing `parseResponse()` in `ImageImportService` throws when JSON is truncated. The recovery logic from LC-104 should be extracted to a shared utility and applied to `parseResponse()` as well, so the old single-pass flow also benefits.

### Files to modify / create

| File | Change |
|---|---|
| `apps/api/src/import/json-recovery.util.ts` | New — shared partial JSON recovery |
| `apps/api/src/import/image-import.service.ts` | Use `recoverPartialJson()` in `parseResponse()` |

### Utility function

```typescript
// apps/api/src/import/json-recovery.util.ts

/**
 * Attempts a full JSON.parse() first.
 * If that fails (truncated array, missing closing bracket),
 * falls back to extracting all complete JSON objects from the string.
 *
 * Example: '[{"a":1},{"a":2},{"a' → [{a:1},{a:2}]
 */
export function recoverJsonArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Try full parse
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    // Extract all complete objects using a balanced brace scanner
    const results: Record<string, unknown>[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const obj = JSON.parse(cleaned.slice(start, i + 1));
            if (typeof obj === 'object' && obj !== null) {
              results.push(obj as Record<string, unknown>);
            }
          } catch { /* skip malformed */ }
          start = -1;
        }
      }
    }

    return results;
  }
}
```

### Update `ImageImportService.parseResponse()`

```typescript
// apps/api/src/import/image-import.service.ts
import { recoverJsonArray } from './json-recovery.util';

private parseResponse(raw: string): ImageExtractedWord[] {
  const items = recoverJsonArray(raw);  // ← replaces JSON.parse() + manual regex

  if (items.length === 0) {
    this.logger.error('Vision model returned non-JSON response', raw.slice(0, 200));
    throw new InternalServerErrorException('AI processing failed. Please try again.');
  }

  return items.map(item => ({
    front:         String(item['front']        ?? ''),
    back:          String(item['back']         ?? ''),
    article:       this.parseArticle(item['article']),
    categoryName:  String(item['categoryName'] ?? 'Other'),
    exampleTarget: String(item['exampleTarget'] ?? ''),
    exampleNative: String(item['exampleNative'] ?? ''),
    confidence:    typeof item['confidence'] === 'number'
      ? Math.min(1, Math.max(0, item['confidence'])) : 0.5,
  })).filter(w => w.back.length > 0);
}
```

### Acceptance criteria

- [ ] `recoverJsonArray()` exported from `json-recovery.util.ts`
- [ ] Given the exact truncated response from the error log, `recoverJsonArray()` returns all complete objects before the truncation point
- [ ] `ImageImportService.parseResponse()` uses `recoverJsonArray()`
- [ ] Unit test: truncated array (missing `]`) → returns all complete objects
- [ ] Unit test: array with one malformed object → skips it, returns the rest
- [ ] Unit test: complete valid array → returns all objects (no regression)

---

---

## LC-108 · Update `ImageImportApiService` for two-phase flow

**Epic:** Resilient Image Import
**Phase:** 2 — Mobile
**Points:** 2
**Depends on:** LC-103, LC-104, LC-105

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/import/services/image-import-api.service.ts` | Add `extractWords()` and `enrichWords()` methods |

```typescript
// image-import-api.service.ts
@Injectable({ providedIn: 'root' })
export class ImageImportApiService {
  private readonly http  = inject(HttpClient);
  private readonly auth  = inject(AuthService);
  private readonly base  = `${environment.apiUrl}/import`;

  /** Phase 1: get raw words from image */
  extractWords(image: PickedImage): Observable<WordExtractionResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType: image.mimeType,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      userId: this.auth.currentUser()!.id,
      contextId: 'german-vocab',
    };
    return this.http.post<WordExtractionResult>(`${this.base}/image/extract`, body);
  }

  /** Phase 2: enrich a list of raw words into full card data */
  enrichWords(req: EnrichWordsRequest): Observable<EnrichWordsResult> {
    return this.http.post<EnrichWordsResult>(`${this.base}/enrich`, req);
  }

  /** Resume enrichment for an incomplete collection */
  completeCollection(collectionId: string): Observable<{
    newCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    return this.http.post<any>(`${this.base}/complete/${collectionId}`, {});
  }
}
```

### Acceptance criteria

- [ ] Three new methods: `extractWords()`, `enrichWords()`, `completeCollection()`
- [ ] All return `Observable<T>` (never subscribe inside service)
- [ ] Old `extractWords()` (which called single-pass `/import/image`) is removed or clearly deprecated

---

---

## LC-109 · New processing screen: two-phase animated progress

**Epic:** Resilient Image Import
**Phase:** 2 — Mobile
**Points:** 3
**Depends on:** LC-108
**Design reference:** screens I02 (Phase 1), I03 (Phase 2 in-progress), I04 (partial result) in `design-reference-lc103-resilient-image-import.html`

### User story

As a user, when I scan an image, I want to see a two-phase progress screen that shows "Extracting words…" then "Generating flashcards…", so I understand what is happening and feel confident the import will succeed even if it takes time.

### Route

`/vault/import/image/processing` — same as before, but updated logic.

### Updated processing flow

```typescript
// image-import-processing.page.ts
enum ProcessingPhase {
  Extracting  = 'extracting',   // Phase 1 — vision call
  Enriching   = 'enriching',    // Phase 2 — text enrichment
  Saving      = 'saving',       // Creating cards
  Done        = 'done',
}

readonly phase         = signal<ProcessingPhase>(ProcessingPhase.Extracting);
readonly extractedCount = signal(0);
readonly enrichedCount  = signal(0);
readonly totalCount     = signal(0);

async run(): Promise<void> {
  const image = this.importState.image();
  if (!image) return this.router.navigate(['/vault/import/image']);

  // ── Phase 1: Extract raw words ──────────────────────────────────────────
  this.phase.set(ProcessingPhase.Extracting);

  let extraction: WordExtractionResult;
  try {
    extraction = await firstValueFrom(this.api.extractWords(image));
  } catch (err) {
    return this.showError('Could not read image. Please try again.');
  }

  this.extractedCount.set(extraction.totalFound);
  this.totalCount.set(extraction.totalFound);
  this.importState.setExtractionResult(extraction);

  if (extraction.totalFound === 0) {
    return this.showError('No German words found in this image.');
  }

  // ── Phase 2: Enrich words ───────────────────────────────────────────────
  this.phase.set(ProcessingPhase.Enriching);

  let enrichResult: EnrichWordsResult;
  try {
    enrichResult = await firstValueFrom(this.api.enrichWords({
      rawWords: extraction.rawWords,
      targetLanguage: 'de',
      nativeLanguage: 'en',
    }));
  } catch (err) {
    // Even if enrichment fails entirely, we have the raw words — navigate to review
    enrichResult = { enriched: [], pending: extraction.rawWords, isComplete: false };
  }

  this.enrichedCount.set(enrichResult.enriched.length);
  this.importState.setEnrichResult(enrichResult);

  // Navigate to review regardless of completeness
  this.router.navigate(['/vault/import/image/review']);
}
```

### Status copy by phase and sub-state

| Phase | Copy |
|---|---|
| Extracting | "Reading your image…" / "Spotting vocabulary…" |
| Enriching (progress) | "Generating cards… 10 of 47" |
| Enriching (partial) | "Saved 32 cards — some still pending" |
| Saving | "Adding to your collection…" |

### Acceptance criteria

- [ ] Phase 1 spinner shows "Reading your image…" with scan animation
- [ ] When Phase 1 completes, word count appears: "Found 47 words"
- [ ] Phase 2 shows incremental counter: "Generating cards… 10 of 47"
- [ ] If enrichment is partial (rate limited), shows amber banner: "32 of 47 cards ready — 15 will be added later"
- [ ] Still navigates to review page in all outcomes — never dead-ends
- [ ] "Cancel" clears state and returns to image picker

---

---

## LC-110 · Incomplete collection banner on `CollectionDetailPage`

**Epic:** Resilient Image Import
**Phase:** 2 — Mobile
**Points:** 2
**Depends on:** LC-103, LC-106, LC-108
**Design reference:** screen I06 in `design-reference-lc103-resilient-image-import.html`

### User story

As a user, when I open a collection that was partially imported, I want to see a clear banner showing how many cards are still pending and a "Complete import" button, so I can easily finish the collection without hunting for a setting.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.ts` | Add `completeImport()` method and incomplete state |
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.html` | Add incomplete banner |
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.scss` | Banner styles |

### Template addition (add just below the header `<ion-toolbar>`)

```html
@if (collection()?.importStatus === 'incomplete') {
  <div class="incomplete-banner">
    <div class="incomplete-banner__icon">
      <ion-icon name="time-outline"></ion-icon>
    </div>
    <div class="incomplete-banner__body">
      <p class="incomplete-banner__title">Import incomplete</p>
      <p class="incomplete-banner__sub">
        {{ collection()!.pendingWords.length }} words still need flashcards
      </p>
    </div>
    <button
      class="incomplete-banner__btn"
      [class.incomplete-banner__btn--loading]="completing()"
      (click)="completeImport()"
      [disabled]="completing()">
      @if (completing()) {
        <span class="lc-spinner-sm"></span>
      } @else {
        Complete
      }
    </button>
  </div>
}
```

### Controller addition

```typescript
readonly completing = signal(false);

async completeImport(): Promise<void> {
  const col = this.collection();
  if (!col || this.completing()) return;

  this.completing.set(true);
  try {
    const result = await firstValueFrom(
      this.importApi.completeCollection(col.id)
    );

    // Update local collection state
    this.collection.update(c => c ? {
      ...c,
      importStatus: result.isComplete ? 'complete' : 'incomplete',
      pendingWords: result.pendingWords,
      cardCount: c.cardCount + result.newCards,
    } : c);

    // Refresh card list
    await this.loadCards();

    const toast = await this.toastCtrl.create({
      message: result.isComplete
        ? `✓ All cards added — collection complete!`
        : `✓ ${result.newCards} cards added — ${result.pendingWords.length} still pending`,
      duration: 3500,
      color: result.isComplete ? 'success' : 'warning',
    });
    await toast.present();
  } catch {
    const toast = await this.toastCtrl.create({
      message: 'Could not complete import. Try again later.',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    this.completing.set(false);
  }
}
```

### Banner SCSS (using LDS tokens)

```scss
@use '../../../../theme/tokens' as t;

.incomplete-banner {
  display: flex;
  align-items: center;
  gap: t.$lc-space-sm;
  margin: t.$lc-space-md t.$lc-space-md 0;
  padding: t.$lc-space-sm t.$lc-space-md;
  background: var(--lc-warning-bg, #fff8ec);
  border: 1px solid var(--lc-warning-border, #f0b429);
  border-radius: t.$lc-radius-md;

  &__icon {
    font-size: 20px;
    color: var(--lc-warning, #f0b429);
    flex-shrink: 0;
  }

  &__body { flex: 1; }

  &__title {
    font-family: var(--lc-font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--lc-text-primary);
    margin: 0;
  }

  &__sub {
    font-size: 12px;
    color: var(--lc-text-secondary);
    margin: 2px 0 0;
  }

  &__btn {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: t.$lc-radius-sm;
    background: var(--lc-brand);
    color: white;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;

    &--loading { opacity: 0.7; cursor: not-allowed; }
  }
}
```

### Acceptance criteria

- [ ] Banner renders only when `collection.importStatus === 'incomplete'`
- [ ] Banner shows the exact count of `pendingWords.length`
- [ ] "Complete" button shows spinner while API call is in flight
- [ ] On success: collection `cardCount` updates in place, card list refreshes, toast shows
- [ ] If still incomplete after resume (second rate limit), shows warning toast with remaining count
- [ ] Banner disappears when `importStatus === 'complete'`
- [ ] No banner on collections created by CSV import (their `importStatus` defaults to `'complete'`)

---

---

## LC-111 · "Complete import" resume flow (end-to-end)

**Epic:** Resilient Image Import
**Phase:** 2 — Mobile
**Points:** 3
**Depends on:** LC-110
**Design reference:** screen I06 (success state — banner disappears, ghost rows replaced) in `design-reference-lc103-resilient-image-import.html`

### User story

As a user, when I tap "Complete import" on an incomplete collection and the enrichment also hits a rate limit, I want the app to save whatever extra cards were generated, update the pending count, and show me a clear message — so I never lose progress and can always resume later.

### This ticket covers the edge cases of LC-110

Specifically:
- Second-attempt rate limit (partial resume): save newly generated cards, reduce `pendingWords`, update banner count
- Network error during resume: show error toast, keep collection state unchanged
- Complete success on resume: banner disappears, confetti/success animation
- Attempting to resume while another resume is in flight: debounced, "Complete" button disabled

### Success animation

On `isComplete: true`, trigger a brief success state on the collection detail:

```typescript
// After successful complete
if (result.isComplete) {
  // Brief visual celebration — CSS class on the collection name
  this.justCompleted.set(true);
  setTimeout(() => this.justCompleted.set(false), 2000);
}
```

```html
<span class="col-name" [class.col-name--just-completed]="justCompleted()">
  {{ collection()?.name }}
</span>
```

```scss
.col-name--just-completed {
  color: var(--lc-brand);
  transition: color 0.3s ease;
}
```

### Acceptance criteria

- [ ] All edge cases from LC-110 user story covered
- [ ] `justCompleted` signal drives a brief name color change on full completion
- [ ] Double-tap protection: `completing()` signal prevents concurrent API calls
- [ ] Network timeout (>30s): caught, error toast shown, state unchanged

---

---

## LC-112 · Incomplete collections indicator on collections list

**Epic:** Resilient Image Import
**Phase:** 3 — Polish
**Points:** 2
**Depends on:** LC-103
**Design reference:** screen I07 in `design-reference-lc103-resilient-image-import.html`

### User story

As a user browsing my collections, I want to see a small visual indicator on any incomplete collection, so I can tell at a glance that it needs attention without having to open it.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/pages/collections/collections.page.html` | Add incomplete indicator to collection card |
| `apps/mobile/src/app/features/vault/pages/collections/collections.page.scss` | Indicator styles |

### Template change (inside existing `@for (col of collections()` loop)

```html
<div class="col-card-name-row">
  <span class="col-card-emoji">{{ col.emoji }}</span>
  <span class="col-card-name lc-display">{{ col.name }}</span>
  @if (col.importStatus === 'incomplete') {
    <span class="col-incomplete-dot" title="{{ col.pendingWords.length }} cards pending"></span>
  }
</div>
```

```scss
.col-incomplete-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lc-warning, #f0b429);
  flex-shrink: 0;
  margin-left: 4px;
  align-self: center;
}
```

### Acceptance criteria

- [ ] Amber dot appears next to collection name when `importStatus === 'incomplete'`
- [ ] Dot disappears after collection is completed
- [ ] Dot is visible in both light and dark mode
- [ ] Tapping the collection still navigates to collection detail (dot is decorative, not a button)

---

---

## LC-113 · Unit tests for batch enrichment and partial recovery

**Epic:** Resilient Image Import
**Phase:** 3 — Polish
**Points:** 2
**Depends on:** LC-105, LC-107

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/import/json-recovery.util.spec.ts` | Tests for `recoverJsonArray()` |
| `apps/api/src/import/word-enrich.service.spec.ts` | Tests for `WordEnrichService` |

### Test cases

```typescript
// json-recovery.util.spec.ts
describe('recoverJsonArray()', () => {
  it('full valid array → returns all objects');
  it('truncated array (missing ]) → returns all complete objects');
  it('markdown-fenced array → strips fences and returns objects');
  it('single complete object + truncated object → returns 1 result');
  it('empty string → returns []');
  it('non-array valid JSON → returns []');
  it('exact error log from production → returns 50 objects');  // use log from the issue
});

// word-enrich.service.spec.ts
describe('WordEnrichService', () => {
  describe('enrichWords()', () => {
    it('25 words → 2 batches of 10 + 1 batch of 5 → all enriched, isComplete: true');
    it('429 on batch 2 → 10 enriched, 15 pending, isComplete: false');
    it('non-429 error on batch 1 → skips batch 1, continues batch 2');
    it('empty rawWords → returns { enriched: [], pending: [], isComplete: true }');
  });
});
```

### Acceptance criteria

- [ ] All 9 test cases pass
- [ ] Production error log test case: the exact response from the user's error log correctly recovers 50 words
- [ ] `jest --coverage` shows ≥ 90% branch coverage on `json-recovery.util.ts` and `word-enrich.service.ts`

---

---

## Dependency Chain

```
LC-103 (domain types + DB migration)
  ├── LC-104 (Phase 1 extract endpoint)
  │     └── LC-107 (partial JSON recovery — can start in parallel)
  ├── LC-105 (Phase 2 enrich endpoint)
  │     └── LC-106 (resume endpoint)
  └── LC-108 (mobile API service)
        ├── LC-109 (processing screen)
        ├── LC-110 (incomplete banner)
        │     └── LC-111 (edge case polish)
        └── LC-112 (collections list indicator)
LC-113 (tests — after LC-105 + LC-107)
```

## Implementation Order

1. **LC-103** — Domain types and DB migration. Nothing else compiles without this.
2. **LC-107** — Partial JSON recovery (quick win, fixes the bug immediately).
3. **LC-104** — Phase 1 extract endpoint.
4. **LC-105** — Phase 2 enrich endpoint.
5. **LC-106** — Resume endpoint.
6. **LC-108** — Mobile API service update.
7. **LC-109** — Processing screen two-phase UI.
8. **LC-110** — Incomplete banner on collection detail.
9. **LC-111** — Edge case polish for resume flow.
10. **LC-112** — Incomplete indicator on collections list.
11. **LC-113** — Unit tests.

---

## Non-goals for this Epic

- Storing the source image after import (images are still discarded post-session)
- Letting users retry Phase 1 (re-scan) from the incomplete collection — they'd need to take a new photo
- Automatic background retry of incomplete collections (user must tap "Complete")
- Partial enrichment progress shown per-word in the review screen
- Migrating existing collections to have `importStatus` set retroactively

---

## What Changes in the Error Log Case

The log showed: `ERROR [ImageImportService] Vision model returned non-JSON response` followed by 50+ valid objects that were discarded.

After this epic:
1. `recoverJsonArray()` (LC-107) recovers all complete objects from the truncated response immediately
2. Phase 1 (LC-104) only asks for `back` + `article` per word — the Phase 1 response for 50 words is ~500 tokens, virtually never truncated
3. Phase 2 (LC-105) processes in batches of 10 — if a batch fails, the 40 already-enriched words are saved, not lost
4. The user sees a collection with 40 cards and a banner: "15 cards still pending — tap Complete to finish"
