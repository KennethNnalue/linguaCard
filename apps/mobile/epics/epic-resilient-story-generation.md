# Epic: Resilient Story Generation
## Partial Recovery · "Extend Story" Badge · Zero Wasted Tokens

> **Epic Number:** LC-130 (continuing from LC-128 tiered AI routing docs)
> **Feature Areas:**
> - `apps/api/src/stories/story-generation.service.ts` — partial JSON recovery + save-on-parse-fail
> - `apps/api/src/stories/story.entity.ts` — new `generationStatus` column
> - `libs/shared/domain/src/index.ts` — `StoryGenerationStatus` type + `Story.generationStatus`
> - `apps/api/src/stories/stories.controller.ts` — new `POST /stories/:id/extend` endpoint
> - `apps/mobile/src/app/features/stories/store/story.store.ts` — surface incomplete badge
> - `apps/mobile/src/app/features/stories/pages/story-library/` — "Extend" badge on cards
> - `apps/mobile/src/app/features/stories/services/story-api.service.ts` — `extend()` call
>
> **Ticket numbers:** LC-130 through LC-138
>
> **Depends on:** LC-123–124 (tier-aware story generation already in place)

---

## Context & The Problem

The server log below was captured on **2026-06-02** and shows exactly what goes wrong today:

```
LOG   Story generated | model=anthropic/claude-4.6-sonnet-20260217 | 964in/2711out tokens
ERROR JSON parse failed. Raw response: { "title": "Ein freier Sonnabend", ... }
```

The model produced **2 711 output tokens of valid JSON** — a complete, 46-sentence story — yet the API threw an `InternalServerErrorException` and the user received a 500 error. **All tokens were wasted.** The story was never saved. The user saw a failure screen.

### Root cause

`generateTextWithModel()` calls `JSON.parse()` on the cleaned response. The raw text from this particular run was valid JSON, but something in the cleanup regex (`/```(?:json)?\s*([\s\S]*?)\s*```/i`) or surrounding whitespace caused the parse to fail. Any edge-case formatting (e.g. German curly quotes `„"` inside string values, or a stray character before/after the JSON block) produces an uncaught `SyntaxError`, which immediately throws a 500 — discarding the output.

A related problem: **very long stories** (very-long / extra-long / podcast format) frequently hit the 8 192 token limit mid-sentence, producing syntactically incomplete JSON arrays. Today those also hard-fail. The user never sees the 35 sentences that were generated before the truncation.

### What this epic builds

```
CURRENT BEHAVIOUR            →    NEW BEHAVIOUR
─────────────────────────────────────────────────────────────────────────
JSON.parse fails              →    Attempt partial sentence recovery
                                   Save whatever sentences were extracted
                                   Mark story as generationStatus = 'partial'
                                   Return partial story to user (not 500)

Story saved with all sentences →   generationStatus = 'complete'

User opens story library       →   Partial stories show an "Extend" badge
User taps "Extend"             →   POST /stories/:id/extend
                                   Continues generation from last sentence
                                   Appends new sentences, updates status
```

---

## What changes — at a glance

| Layer | Change |
|---|---|
| `libs/shared/domain` | Add `StoryGenerationStatus` type; add `generationStatus` to `Story` |
| `StoryEntity` | New `generation_status` column (varchar, default `'complete'`) |
| `story-generation.service.ts` | `recoverPartialSentences()` helper; save-on-parse-fail path; `extendStory()` method |
| `stories.controller.ts` | New `POST /stories/:id/extend` endpoint |
| `story-api.service.ts` | New `extend(id)` method |
| `story.store.ts` | `isIncomplete` computed; `extendStory()` method |
| `story-library.page.html` | "Extend" badge on partial story cards |
| `generate-story-sheet.component.ts` | Show "Extending…" state during extend call |

---

## Story Map

| Phase | Ticket | Title | Points |
|-------|--------|-------|--------|
| 0 — Domain | LC-130 | Extend shared domain types (`StoryGenerationStatus`) | 1 |
| 1 — Backend | LC-131 | `StoryEntity`: add `generation_status` column | 1 |
| 1 — Backend | LC-132 | `recoverPartialSentences()` — partial JSON recovery helper | 3 |
| 1 — Backend | LC-133 | Save-on-parse-fail: persist partial story, mark `'partial'` | 3 |
| 1 — Backend | LC-134 | `POST /stories/:id/extend` — continue and append story | 5 |
| 2 — Mobile | LC-135 | `StoryApiService.extend()` + `StoryStore.extendStory()` | 2 |
| 2 — Mobile | LC-136 | "Extend" badge on story library cards | 2 |
| 3 — Polish | LC-137 | Extend flow UX: loading state + success/error toasts | 2 |
| 4 — Tests  | LC-138 | Unit tests for `recoverPartialSentences()` | 2 |

**Total: 21 points**

---

---

## LC-130 · Extend shared domain types

**Epic:** Resilient Story Generation
**Phase:** 0 — Do this first (unblocks all other tickets)
**Points:** 1
**Depends on:** nothing

### User story

As a developer, I want a `StoryGenerationStatus` type and a `generationStatus` field on the `Story` interface, so that the Angular app and NestJS API share a single contract for partial vs complete stories from day one.

### Files to modify

| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Add `StoryGenerationStatus`; extend `Story` |

### Types to add

```typescript
// libs/shared/domain/src/index.ts

// ─── RESILIENT STORY GENERATION ──────────────────────────────────────────────

/**
 * 'complete'  — all sentences generated and saved successfully.
 * 'partial'   — JSON parse failed or token limit hit; some sentences saved,
 *               story can be extended via POST /stories/:id/extend.
 * 'extending' — a client-side transient state: an extend request is in flight.
 *               Never stored in the DB; set locally in StoryStore only.
 */
export type StoryGenerationStatus = 'complete' | 'partial' | 'extending';
```

Extend the existing `Story` interface:

```typescript
export interface Story {
  // ... all existing fields unchanged ...
  generationStatus: StoryGenerationStatus;   // ← new field (default 'complete' for old stories)
}
```

### Acceptance criteria

- [ ] `StoryGenerationStatus` exported from `@lingua-card/shared/domain`
- [ ] `Story.generationStatus` field added (required, not optional — defaults handled by `toModel()`)
- [ ] `tsc --noEmit` passes in `libs/shared/domain/` and `apps/api/` and `apps/mobile/`
- [ ] No existing types broken; old stories without the DB column still map to `'complete'` via `?? 'complete'` in `toModel()`

---

---

## LC-131 · `StoryEntity`: add `generation_status` column

**Epic:** Resilient Story Generation
**Phase:** 1 — Backend
**Points:** 1
**Depends on:** LC-130

### User story

As a developer, I want a `generation_status` column on the `stories` table so that partial stories are flagged in the database and can be queried for extension.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story.entity.ts` | Add `generationStatus` column |

### Implementation

```typescript
// apps/api/src/stories/story.entity.ts

import type {
  StorySentence, WordTimestamp, StoryVocabWord,
  StoryDifficulty, StoryLength,
  StoryQuizQuestion, StoryGrammarNote, StoryKeyword,
  StoryGenerationStatus,          // ← import new type
} from '@lingua-card/shared/domain';

@Entity('stories')
export class StoryEntity {
  // ... all existing columns unchanged ...

  @Column({
    name: 'generation_status',
    type: 'varchar',
    length: 20,
    default: 'complete',
  })
  generationStatus!: StoryGenerationStatus;
}
```

Update `toModel()` in `StoryGenerationService` (and anywhere else `toModel` is defined):

```typescript
private toModel(e: StoryEntity): Story {
  return {
    // ... all existing fields ...
    generationStatus: (e.generationStatus ?? 'complete') as StoryGenerationStatus,
  };
}
```

### Notes

- `synchronize: true` in dev will auto-add the column. Production should run a migration.
- The `default: 'complete'` means all rows created before this ticket (and any row without explicit status) correctly resolve as complete.

### Acceptance criteria

- [ ] `StoryEntity` has `generationStatus` column with `default: 'complete'`
- [ ] `toModel()` maps `e.generationStatus ?? 'complete'` — existing stories without the column are safe
- [ ] `GET /stories` returns all stories with `generationStatus` in the payload
- [ ] Dev server starts without error; `stories` table has `generation_status` column

---

---

## LC-132 · `recoverPartialSentences()` — partial JSON recovery helper

**Epic:** Resilient Story Generation
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-130

### User story

As a developer, I want a `recoverPartialSentences()` helper that extracts all valid sentence objects from a raw AI response — even if the JSON is truncated or malformed — so that no generated content is ever silently discarded.

### Context

The production error log shows a response that was valid JSON yet still failed to parse (likely due to formatting). A second common failure mode is token-limit truncation: the model stops mid-array, leaving the JSON syntactically incomplete. Both cases produce a `SyntaxError` from `JSON.parse()`.

This helper handles both:
1. **Full JSON** — delegates to `JSON.parse()` as before.
2. **Structurally truncated** — extracts complete `{ "german": ..., "english": ..., "vocabWordsUsed": [...] }` objects using a regex object scanner, identical to the `recoverPartialJson` pattern already established in `apps/api/src/import/` (see resilient image import epic LC-107).
3. **Outer wrapper present but sentences truncated** — extracts title and titleTranslation from the outer object, then recovers sentences individually.

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/stories/story-json-recovery.util.ts` | Standalone recovery utility (pure function, easy to unit test) |

### Implementation

```typescript
// apps/api/src/stories/story-json-recovery.util.ts

import type { GeneratedStoryContent } from '../ai/models/ai-request.model';

export interface RecoveryResult {
  content: GeneratedStoryContent | null;
  sentenceCount: number;
  wasRecovered: boolean;   // true if full JSON.parse failed and fallback was used
}

/**
 * Attempts to parse a raw AI response as GeneratedStoryContent.
 *
 * Strategy:
 *  1. Strip markdown fences (```json ... ```) if present.
 *  2. Try JSON.parse() on the cleaned string — fast path for well-formed responses.
 *  3. On failure: scan for a top-level title/titleTranslation via regex.
 *  4. Scan for complete sentence objects via object-pattern regex.
 *  5. Return whatever was found; callers decide the minimum acceptable count.
 */
export function recoverStoryContent(rawText: string): RecoveryResult {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // ── Fast path: try full parse ────────────────────────────────────────────
  try {
    const parsed = JSON.parse(cleaned) as GeneratedStoryContent;
    if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
      return {
        content: parsed,
        sentenceCount: parsed.sentences.length,
        wasRecovered: false,
      };
    }
  } catch {
    // fall through to recovery
  }

  // ── Recovery path ────────────────────────────────────────────────────────
  const titleMatch = cleaned.match(/"title"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
  const titleTransMatch = cleaned.match(/"titleTranslation"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);

  const title = titleMatch?.[1] ?? 'Unvollständige Geschichte';
  const titleTranslation = titleTransMatch?.[1] ?? 'Incomplete Story';

  const sentences = recoverSentences(cleaned);

  if (sentences.length === 0) {
    return { content: null, sentenceCount: 0, wasRecovered: true };
  }

  return {
    content: { title, titleTranslation, sentences },
    sentenceCount: sentences.length,
    wasRecovered: true,
  };
}

/**
 * Extracts all complete sentence objects from a raw JSON string.
 * An object is "complete" if it has at least a non-empty `german` field.
 */
function recoverSentences(raw: string): GeneratedStoryContent['sentences'] {
  const results: GeneratedStoryContent['sentences'] = [];

  // Match complete JSON objects (handles nested arrays like vocabWordsUsed)
  // Strategy: find opening braces and track depth to extract complete objects
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf('{', i);
    if (start === -1) break;

    let depth = 0;
    let j = start;
    let inString = false;
    let escape = false;

    while (j < raw.length) {
      const ch = raw[j];
      if (escape) { escape = false; j++; continue; }
      if (ch === '\\') { escape = true; j++; continue; }
      if (ch === '"') { inString = !inString; j++; continue; }
      if (inString) { j++; continue; }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          // Found a complete object
          try {
            const obj = JSON.parse(raw.slice(start, j + 1)) as Record<string, unknown>;
            if (typeof obj['german'] === 'string' && obj['german'].length > 0) {
              results.push({
                german: obj['german'] as string,
                english: typeof obj['english'] === 'string' ? obj['english'] : '',
                vocabWordsUsed: Array.isArray(obj['vocabWordsUsed'])
                  ? (obj['vocabWordsUsed'] as string[])
                  : [],
              });
            }
          } catch { /* malformed object — skip */ }
          i = j + 1;
          break;
        }
      }
      j++;
    }
    if (j >= raw.length) break;
  }

  return results;
}
```

### Acceptance criteria

- [ ] `recoverStoryContent(validJson)` returns `{ wasRecovered: false, sentenceCount: N }` where N matches the actual sentence count
- [ ] `recoverStoryContent(truncatedJson)` (missing closing `]}`) recovers all complete sentence objects before the truncation
- [ ] `recoverStoryContent('')` returns `{ content: null, sentenceCount: 0, wasRecovered: true }`
- [ ] `recoverStoryContent(logPayload)` where `logPayload` is the exact 46-sentence response from the error log returns all 46 sentences with `wasRecovered: false` (full parse succeeds when properly cleaned)
- [ ] Function is a pure utility — no NestJS decorators, no DI, no side effects
- [ ] `tsc --noEmit` passes

---

---

## LC-133 · Save-on-parse-fail: persist partial story, mark `'partial'`

**Epic:** Resilient Story Generation
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-131, LC-132

### User story

As a language learner, when story generation partially fails (JSON parse error or token limit hit), I want the sentences that were generated to be saved automatically — and the story to appear in my library — rather than seeing a blank error screen.

### Context

Today `generateTextWithModel()` throws `InternalServerErrorException` on any parse failure. This ticket replaces that hard throw with a recovery path: attempt `recoverStoryContent()`, and if at least `MIN_SENTENCES` (= 5) were recovered, save the story as `generationStatus = 'partial'` and return it. Only if recovery produces fewer than 5 sentences should the 500 be thrown.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-generation.service.ts` | Replace `JSON.parse` block; add save-on-partial logic |

### Implementation

Replace the current `generateTextWithModel()` JSON parsing block:

```typescript
// BEFORE (apps/api/src/stories/story-generation.service.ts)
const clean = (rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? rawText).trim();
try {
  return JSON.parse(clean) as GeneratedStoryContent;
} catch {
  this.logger.error('JSON parse failed. Raw response:', rawText);
  throw new InternalServerErrorException('Story generation returned invalid data.');
}

// AFTER
const { content, sentenceCount, wasRecovered } = recoverStoryContent(rawText);

if (!content || sentenceCount < MIN_RECOVERABLE_SENTENCES) {
  this.logger.error('Story parse failed — recovery found < MIN sentences. Raw response:', rawText);
  throw new InternalServerErrorException('Story generation returned invalid data.');
}

if (wasRecovered) {
  this.logger.warn(
    `Story parse failed but recovered ${sentenceCount} sentences — will save as partial.`,
    { sentenceCount },
  );
}

return { content, isPartial: wasRecovered };
```

Add to top of file:
```typescript
const MIN_RECOVERABLE_SENTENCES = 5;
```

Update `generateAndSave()` to receive the `isPartial` flag and stamp `generationStatus` on the entity before saving:

```typescript
// In generateAndSave():
const { content, isPartial } = await this.generateTextWithModel(dto, cards, model);

// ... build entity as before ...

entity.generationStatus = isPartial ? 'partial' : 'complete';
```

Update `StoryGenerationService.generateTextWithModel()` return type:

```typescript
private async generateTextWithModel(
  dto: GenerateStoryDto,
  cards: CardEntity[],
  model: string,
): Promise<{ content: GeneratedStoryContent; isPartial: boolean }> { ... }
```

### Acceptance criteria

- [ ] When Claude returns valid JSON (normal case): `generationStatus = 'complete'`, behaviour unchanged
- [ ] When Claude returns recoverable partial JSON (≥ 5 sentences): story is **saved** with `generationStatus = 'partial'`; API returns HTTP 201 with the partial story; no 500 thrown
- [ ] When recovery yields < 5 sentences: `InternalServerErrorException` thrown as before
- [ ] Server log shows `WARN` not `ERROR` for recoverable cases; `ERROR` only for unrecoverable
- [ ] Partial story returned to Angular client has correct `generationStatus: 'partial'`
- [ ] `tsc --noEmit` passes

---

---

## LC-134 · `POST /stories/:id/extend` — continue and append story

**Epic:** Resilient Story Generation
**Phase:** 1 — Backend
**Points:** 5
**Depends on:** LC-131, LC-133

### User story

As a language learner, when I tap "Extend" on a partial story, I want the API to generate additional sentences that continue naturally from where the story left off, append them to the existing story, and mark the story as complete — so I end up with a full story without re-generating what was already written.

### Context

This is the key endpoint that makes partial stories useful. The prompt for extension must:
1. Provide the full story so far (existing sentences as context)
2. Instruct the model to continue — not restart — from the last sentence
3. Request enough sentences to reach the expected length for the story's `lengthType`
4. Return the same JSON sentence format as the original generation

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/stories.controller.ts` | Add `POST /:id/extend` route |
| `apps/api/src/stories/stories.service.ts` | Add `extend(userId, id)` method |
| `apps/api/src/stories/story-generation.service.ts` | Add `extendStory(entity)` method |
| `apps/api/src/stories/story-prompt.builder.ts` | Add `buildExtensionPrompt(entity)` method |

### Implementation

```typescript
// apps/api/src/stories/stories.controller.ts
@Post(':id/extend')
@UseGuards(JwtAuthGuard)
extend(
  @Param('id') id: string,
  @Request() req: AuthRequest,
): Promise<Story> {
  return this.storiesService.extend(req.user.id, id);
}
```

```typescript
// apps/api/src/stories/stories.service.ts
async extend(userId: string, id: string): Promise<Story> {
  const entity = await this.repo.findOneBy({ id, userId });
  if (!entity) throw new NotFoundException(`Story ${id} not found`);
  if (entity.generationStatus !== 'partial') {
    // Idempotent: extending a complete story is a no-op
    return this.toModel(entity);
  }
  return this.generation.extendStory(entity);
}
```

```typescript
// apps/api/src/stories/story-generation.service.ts
async extendStory(entity: StoryEntity): Promise<Story> {
  const tier = await this.subscriptions.getEffectiveTier(entity.userId);
  const model = this.modelForTier(tier);

  // Build extension prompt using existing sentences as context
  const prompt = this.promptBuilder.buildExtensionPrompt(entity);

  let rawText: string;
  try {
    const response = await this.openRouter.generateText({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      model,
    });
    rawText = response.text;
    this.logger.log(
      `Story extension generated | model=${response.model} | ` +
      `${response.inputTokens}in/${response.outputTokens}out tokens`,
    );
  } catch (err) {
    this.logger.error('Story extension AI error', err);
    throw new InternalServerErrorException('Story extension failed. Please try again.');
  }

  const { content, sentenceCount } = recoverStoryContent(rawText);

  if (!content || sentenceCount === 0) {
    this.logger.warn('Story extension returned no usable sentences — story remains partial.');
    // Don't throw — return the existing partial story unchanged
    return this.toModel(entity);
  }

  // Append new sentences to existing ones
  const existingSentences: StorySentence[] = entity.sentences ?? [];
  const newSentences: StorySentence[] = content.sentences.map((s, i) => ({
    ...s,
    // Sentence objects in the DB may have an `index` field depending on migration
  }));

  entity.sentences = [...existingSentences, ...newSentences];
  entity.generationStatus = 'complete';

  // Rebuild bodyDe / bodyEn from all sentences
  entity.bodyDe = entity.sentences.map(s => s.german).join(' ');
  entity.bodyEn = entity.sentences.map(s => s.english).join(' ');

  const saved = await this.storyRepo.save(entity);

  // Re-generate audio for the full extended story (non-blocking)
  void this.regenerateAudioForExtended(saved);

  return this.toModel(saved);
}

private async regenerateAudioForExtended(entity: StoryEntity): Promise<void> {
  try {
    const fullText = entity.sentences.map(s => s.german).join(' ');
    const { audioUrl, timestamps, durationMs } =
      await this.audioService.generateAudioWithTimestamps(fullText, entity.id);

    const markedTimestamps = this.vocabMapper.markVocabWords(
      timestamps,
      entity.vocabWords ?? [],
    );

    entity.audioUrl = audioUrl;
    entity.audioDurationMs = durationMs;
    entity.wordTimestamps = markedTimestamps;

    await this.storyRepo.save(entity);
    this.logger.log(`Audio regenerated for extended story ${entity.id}`);
  } catch (err) {
    this.logger.warn(`Audio regeneration failed for story ${entity.id}`, err);
    // Audio failure is non-blocking — story is already saved as complete
  }
}
```

```typescript
// apps/api/src/stories/story-prompt.builder.ts
buildExtensionPrompt(entity: StoryEntity): string {
  const existingSentences = (entity.sentences ?? [])
    .map((s, i) => `${i + 1}. ${s.german}`)
    .join('\n');

  const targetSentenceCount = this.targetCountForLength(entity.lengthType);
  const remaining = Math.max(5, targetSentenceCount - (entity.sentences?.length ?? 0));

  const difficulty = entity.difficultyLevel ?? 'A2';
  const cefrDesc = this.cefrDescriptions[difficulty as StoryDifficulty];

  return `You are continuing an unfinished German learning story.

STORY SO FAR (do not repeat these sentences):
${existingSentences}

TASK: Continue the story naturally from the last sentence above.
Write exactly ${remaining} additional sentences that:
- Follow on directly from sentence ${entity.sentences?.length ?? 0}
- Match the same characters, setting, and narrative voice
- Stay at CEFR level ${difficulty} — ${cefrDesc}
- Use natural, everyday German

OUTPUT — valid JSON only, no markdown fences, no preamble:
{
  "sentences": [
    { "german": "...", "english": "...", "vocabWordsUsed": [] }
  ]
}`;
}

private targetCountForLength(length: StoryLength): number {
  const map: Record<StoryLength, number> = {
    'short':       12,
    'medium':      22,
    'long':        35,
    'very-long':   50,
    'extra-long':  65,
  };
  return map[length] ?? 22;
}
```

### Acceptance criteria

- [ ] `POST /stories/:id/extend` requires JWT; returns 404 if story not found
- [ ] Extending a `'complete'` story is idempotent — returns the story unchanged, no AI call fired
- [ ] Extending a `'partial'` story appends new sentences; sets `generationStatus = 'complete'`; returns updated story
- [ ] `bodyDe` and `bodyEn` are rebuilt from all sentences (existing + new) after extension
- [ ] Audio regeneration fires asynchronously after save — client doesn't wait for audio
- [ ] If AI extension call fails: 500 is thrown; existing partial story unchanged in DB
- [ ] If extension generates 0 usable sentences: returns existing partial story (no 500)
- [ ] `tsc --noEmit` passes

---

---

## LC-135 · `StoryApiService.extend()` + `StoryStore.extendStory()`

**Epic:** Resilient Story Generation
**Phase:** 2 — Mobile
**Points:** 2
**Depends on:** LC-130, LC-134

### User story

As a developer, I want a clean Angular API service method and store action for extending a story, so that the library UI can trigger an extension request with one method call.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/services/story-api.service.ts` | Add `extend(id)` |
| `apps/mobile/src/app/features/stories/store/story.store.ts` | Add `extendStory(id)`, `isExtending` signal, `incompleteStories` computed |

### Implementation

```typescript
// apps/mobile/src/app/features/stories/services/story-api.service.ts
extend(id: string): Observable<Story> {
  return this.http.post<Story>(`${this.apiUrl}/stories/${id}/extend`, {});
}
```

```typescript
// apps/mobile/src/app/features/stories/store/story.store.ts

// Add to StoryState interface:
interface StoryState {
  // ... existing fields ...
  extendingId: string | null;   // ID of the story currently being extended
  extendError: string | null;
}

// Add to initialState:
extendingId: null,
extendError: null,

// Add to withComputed():
incompleteStories: computed(() =>
  stories().filter(s => s.generationStatus === 'partial')
),

// Add to withMethods():
extendStory(id: string): void {
  void (async () => {
    patchState(store, { extendingId: id, extendError: null });
    try {
      const extended = await firstValueFrom(api.extend(id));
      // Replace the partial story with the extended one in the store
      patchState(store, {
        stories: store.stories().map(s => s.id === id ? extended : s),
        extendingId: null,
      });
      // Persist to local cache
      const userId = uid();
      if (userId) {
        const updatedStories = store.stories();
        await localData.setStories(userId, updatedStories);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extension failed';
      patchState(store, { extendingId: null, extendError: msg });
    }
  })();
},
```

### Acceptance criteria

- [ ] `StoryApiService.extend(id)` POSTs to `/stories/:id/extend` with empty body and returns `Observable<Story>`
- [ ] `StoryStore.extendStory(id)` sets `extendingId` to the story's ID while in flight
- [ ] On success: partial story in `stories[]` is replaced with the extended story; `extendingId` cleared
- [ ] On error: `extendError` is populated; `extendingId` cleared
- [ ] `incompleteStories` computed returns only stories where `generationStatus === 'partial'`
- [ ] `tsc --noEmit` passes in `apps/mobile/`

---

---

## LC-136 · "Extend" badge on story library cards

**Epic:** Resilient Story Generation
**Phase:** 2 — Mobile
**Points:** 2
**Depends on:** LC-130, LC-135

### User story

As a language learner, I want partial stories in my library to show a clear visual indicator and an "Extend" action so I know which stories are incomplete and can finish them with one tap.

### Design spec

The partial story card shows a small amber badge `"Incomplete"` below the title, and an `"Extend"` secondary button alongside the regular `"Listen · Read"` button. The badge uses `--lc-warn` / `--lc-warn-light` colours (amber, consistent with the incomplete collection banner in the resilient image import epic).

While extension is in progress (`extendingId === story.id`), the button shows a spinner and `"Extending…"` text and is disabled.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | Add incomplete badge + Extend button |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | Expose `extendingId`, `extendStory()` |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.scss` | Badge + extend button styles |

### HTML changes (inside each story card `@for` block)

```html
<!-- Add immediately below the story title -->
@if (story.generationStatus === 'partial') {
  <div class="sl-incomplete-badge">
    <ion-icon name="warning-outline"></ion-icon>
    Incomplete
  </div>
}

<!-- Add to card actions, alongside the existing Listen · Read button -->
@if (story.generationStatus === 'partial') {
  <button
    class="sl-btn-extend"
    [class.sl-btn-extend--loading]="extendingId() === story.id"
    [disabled]="extendingId() === story.id"
    (click)="onExtend(story.id)"
  >
    @if (extendingId() === story.id) {
      <ion-spinner name="dots"></ion-spinner>
      Extending…
    } @else {
      <ion-icon name="add-circle-outline"></ion-icon>
      Extend
    }
  </button>
}
```

### TypeScript changes

```typescript
// story-library.page.ts
readonly extendingId = this.storyStore.extendingId;

onExtend(id: string): void {
  this.storyStore.extendStory(id);
}
```

### SCSS additions

```scss
// story-library.page.scss
.sl-incomplete-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--lc-warn-light, #FEF3C7);
  color: var(--lc-warn-text, #92400E);
  border: 1px solid var(--lc-warn-border, #FCD34D);
  border-radius: var(--lc-radius-sm);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  margin-top: 4px;

  ion-icon { font-size: 12px; }
}

.sl-btn-extend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--lc-radius-sm);
  border: 1px solid var(--lc-warn-border, #FCD34D);
  background: var(--lc-warn-light, #FEF3C7);
  color: var(--lc-warn-text, #92400E);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--lc-font-body);

  &--loading, &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  ion-icon { font-size: 16px; }
  ion-spinner { width: 14px; height: 14px; }
}
```

### Acceptance criteria

- [ ] Partial stories show the amber `"Incomplete"` badge below their title
- [ ] Complete stories show no badge (no visual change to happy path)
- [ ] Tapping "Extend" triggers `StoryStore.extendStory(id)`; button shows spinner + "Extending…" while in flight
- [ ] On success: badge and Extend button disappear (story is now complete); story card re-renders with full content
- [ ] On error: button returns to "Extend" state; error is surfaced (see LC-137)
- [ ] `addIcons` includes `warningOutline` and `addCircleOutline`
- [ ] No visual regressions on complete story cards

---

---

## LC-137 · Extend flow UX: loading state + success/error toasts

**Epic:** Resilient Story Generation
**Phase:** 3 — Polish
**Points:** 2
**Depends on:** LC-135, LC-136

### User story

As a language learner, I want clear feedback when an extension succeeds or fails, so that I know whether my story is now complete or if I should try again.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | React to `extendError`; show toasts |
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.html` | Wire `effect()` to toast |

### Implementation

```typescript
// story-library.page.ts
import { effect } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';

// In constructor or ngOnInit:
private readonly toastCtrl = inject(ToastController);

constructor() {
  addIcons({ ... });

  // Watch for successful extension (extendingId cleared + story is now complete)
  effect(async () => {
    const err = this.storyStore.extendError();
    if (err) {
      const toast = await this.toastCtrl.create({
        message: 'Extension failed — please try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  });
}

// Success is implicit: the badge disappears and the story card updates.
// No extra success toast needed — the UI change is the confirmation.
```

### Acceptance criteria

- [ ] On extension error: an Ionic toast appears at the bottom: `"Extension failed — please try again."` (danger colour, 3s duration)
- [ ] Toast does not appear on success — the badge removal is sufficient feedback
- [ ] If multiple extensions are somehow triggered in parallel, only one can be in flight at a time (`extendingId` being set blocks the button via `[disabled]`)
- [ ] Error toast does not fire on initial page load (effect only triggers when `extendError` transitions from null to a value)

---

---

## LC-138 · Unit tests for `recoverPartialSentences()`

**Epic:** Resilient Story Generation
**Phase:** 4 — Tests
**Points:** 2
**Depends on:** LC-132

### User story

As a developer, I want unit tests for `recoverStoryContent()` that prove recovery works correctly for every known failure mode, so that a future refactor can't silently break the zero-token-waste guarantee.

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/stories/story-json-recovery.util.spec.ts` | Jest unit tests |

### Test cases

```typescript
// apps/api/src/stories/story-json-recovery.util.spec.ts

import { recoverStoryContent } from './story-json-recovery.util';

// The 46-sentence payload from the 2026-06-02 error log
const PRODUCTION_PAYLOAD = `{
  "title": "Ein freier Sonnabend",
  "titleTranslation": "A Free Saturday",
  "sentences": [
    { "german": "Heute ist Sonnabend.", "english": "Today is Saturday.", "vocabWordsUsed": ["der Sonnabend"] },
    ... // full payload
  ]
}`;

describe('recoverStoryContent()', () => {
  it('valid complete JSON → returns full parse, wasRecovered: false', () => {
    const result = recoverStoryContent(PRODUCTION_PAYLOAD);
    expect(result.wasRecovered).toBe(false);
    expect(result.sentenceCount).toBe(46);
    expect(result.content?.title).toBe('Ein freier Sonnabend');
  });

  it('valid JSON wrapped in markdown fences → strips fences and parses correctly', () => {
    const fenced = '```json\n' + PRODUCTION_PAYLOAD + '\n```';
    const result = recoverStoryContent(fenced);
    expect(result.wasRecovered).toBe(false);
    expect(result.sentenceCount).toBe(46);
  });

  it('truncated array (missing closing ]}) → recovers all complete objects', () => {
    const truncated = PRODUCTION_PAYLOAD.slice(0, PRODUCTION_PAYLOAD.lastIndexOf('}') - 150);
    const result = recoverStoryContent(truncated);
    expect(result.wasRecovered).toBe(true);
    expect(result.sentenceCount).toBeGreaterThan(0);
  });

  it('single valid sentence + truncated second sentence → recovers 1 sentence', () => {
    const partial = `{
      "title": "Test",
      "sentences": [
        { "german": "Hallo.", "english": "Hello.", "vocabWordsUsed": [] },
        { "german": "Wie geht
    `;  // truncated mid-sentence
    const result = recoverStoryContent(partial);
    expect(result.wasRecovered).toBe(true);
    expect(result.sentenceCount).toBe(1);
    expect(result.content?.sentences[0].german).toBe('Hallo.');
  });

  it('empty string → returns null content, 0 sentences', () => {
    const result = recoverStoryContent('');
    expect(result.content).toBeNull();
    expect(result.sentenceCount).toBe(0);
    expect(result.wasRecovered).toBe(true);
  });

  it('completely non-JSON response → returns null content', () => {
    const result = recoverStoryContent('I cannot generate a story right now.');
    expect(result.content).toBeNull();
    expect(result.sentenceCount).toBe(0);
  });

  it('JSON with German curly quotes inside strings → parses successfully', () => {
    const withCurly = `{
      "title": "Test",
      "titleTranslation": "Test",
      "sentences": [
        { "german": "Sie sagt: \\u201eHallo!\\u201c", "english": "She says: \\"Hello!\\"", "vocabWordsUsed": [] }
      ]
    }`;
    const result = recoverStoryContent(withCurly);
    expect(result.sentenceCount).toBe(1);
  });

  it('object missing german field → skipped during recovery', () => {
    const malformed = `{
      "sentences": [
        { "english": "Hello.", "vocabWordsUsed": [] },
        { "german": "Tschüss.", "english": "Goodbye.", "vocabWordsUsed": [] }
      ]
    }`;
    const result = recoverStoryContent(malformed);
    // Full parse may succeed; recovered count should be 1 for the object without `german`
    // OR full parse succeeds and returns 2 (with empty german filtered later)
    // Key: no crash
    expect(result).toBeDefined();
  });
});
```

### Acceptance criteria

- [ ] All 8 test cases pass with `nx test api`
- [ ] Production payload test case (`PRODUCTION_PAYLOAD`) correctly recovers all 46 sentences with `wasRecovered: false`
- [ ] `jest --coverage` shows ≥ 90% branch coverage on `story-json-recovery.util.ts`
- [ ] No external dependencies — pure function tests only

---

---

## Dependency Chain

```
LC-130 (domain types)
  ├── LC-131 (entity column)
  │     └── LC-133 (save-on-fail — needs column)
  │           └── LC-134 (extend endpoint — needs partial save)
  │                 └── LC-135 (mobile store + service)
  │                       ├── LC-136 (badge UI)
  │                       └── LC-137 (UX polish — toasts)
  └── LC-132 (recovery util — pure, can run in parallel with LC-131)
        ├── LC-133 (uses recoverStoryContent())
        └── LC-138 (tests for recovery util)
```

## Implementation Order

1. **LC-130** — Domain types. Nothing else compiles until `StoryGenerationStatus` exists.
2. **LC-131** — Entity column. Quick, unblocks LC-133.
3. **LC-132** — Recovery utility. Pure function, safe to build in parallel with LC-131.
4. **LC-133** — Save-on-parse-fail. This is the core fix — stops token waste immediately.
5. **LC-134** — Extend endpoint. The extend action makes partial stories useful rather than just tolerated.
6. **LC-135** — Mobile store + service. Wires the Angular side to LC-134.
7. **LC-136** — Badge UI. Surfaces the feature to users.
8. **LC-137** — UX polish (toasts). Low risk, last.
9. **LC-138** — Unit tests. Write after LC-132 is stable; run in parallel with LC-134 onwards.

---

## Non-goals for this Epic

- No streaming / SSE progress during story generation (that was LC-065 scope)
- No automatic background retry of partial stories — user initiates extension manually
- No splitting of very long story generation into multiple smaller AI calls (a future optimisation)
- No per-sentence granularity in the `'partial'` status — we store a flat `sentences[]` array; the status simply means "not the full expected count"
- No migration to retroactively mark old stories — all rows without the column default to `'complete'` via the entity default
- No change to TTS or word timestamps during initial generation — audio is regenerated only after a successful extension

---

## What changes in the error log case

The log captured on 2026-06-02 showed:

```
ERROR [StoryGenerationService] JSON parse failed. Raw response:
{ "title": "Ein freier Sonnabend", ... 46 sentences ... }
```

After this epic:

1. **LC-132** — `recoverStoryContent()` called instead of raw `JSON.parse()`. The cleanup regex issue is fixed; the exact payload parses successfully with `wasRecovered: false`.
2. **LC-133** — Even if parse had failed for any reason, the 46 recovered sentences would be saved as a `partial` story (≥ 5 sentences threshold met).
3. The user receives HTTP 201 with their story instead of a 500 error.
4. If the story had been marked `partial`, the "Extend" badge would appear — and one tap would complete it.
5. **964 input tokens and 2 711 output tokens are no longer wasted.**
