# Epic LC-AP · Audio Persistence, Pre-generation & Word Deduplication

> **Builds on:** LC-WA (Global Word Audio Registry)
> **Points remaining:** ~28
> **Phases:** A (Cache Fix) · B (Pre-generation) · C (Client Dedup) · D (Ops Migration)

---

## 1 · Current State Audit

### R2 bucket clarification

| Prefix | What it holds | Status |
|--------|---------------|--------|
| `pronunciation/{cardId}.wav` | Legacy format. One file per card, keyed by cardId. Two cards with the same word = two files. Generated on first tap 🔊. | ⚠️ Legacy — being migrated away |
| `word-audio/{hash}.wav` | Target format. One file per unique normalized word text, keyed by SHA-256 hash. "der Hund" stored once regardless of how many cards reference it. | ✅ Target |
| `stories/{storyId}.wav` | Full story narration audio with karaoke timestamps. Separate product. | ✅ Works — not touched by this epic |

### What's already built (from LC-WA — do not rebuild)

| Component | File | Status |
|-----------|------|--------|
| `WordAudioService` (NestJS) | `apps/api/src/word-audio/word-audio.service.ts` | ✅ Complete — `resolve()`, `batchResolve()`, `generateAndPersist()`, inflight dedup |
| `WordAudioEntity` + DB migration | `apps/api/src/word-audio/word-audio.entity.ts` | ✅ Complete — `word_audio` table, normalized_text unique index |
| WordAudio API endpoints | `apps/api/src/word-audio/word-audio.controller.ts` | ✅ Complete — POST /resolve, POST /batch-resolve, GET /lookup |
| `WordAudioService` (Angular) | `apps/mobile/src/app/shared/audio/word-audio.service.ts` | ✅ Complete — memory cache → device cache → API → Web Speech fallback |
| `WordAudioApiService` (Angular) | `apps/mobile/src/app/shared/audio/word-audio-api.service.ts` | ✅ Complete |
| `PronunciationService` (Angular) | `apps/mobile/src/app/features/ai/audio/pronunciation.service.ts` | ✅ @deprecated thin wrapper delegating to WordAudioService |
| `AiController.pronunciation` | `apps/api/src/ai/ai.controller.ts` | ✅ Already delegates to `WordAudioService.resolve()` |
| `AiAudioCacheService` | `apps/mobile/src/app/features/ai/audio/ai-audio-cache.service.ts` | ✅ Complete — Capacitor Filesystem cache for story audio |
| `WordDedupService` (NestJS) | `apps/api/src/cards/word-dedup.service.ts` | ✅ Complete — `findDuplicates()` against user's card vault |
| `POST /cards/check-duplicates` | `apps/api/src/cards/cards.controller.ts` | ✅ Complete — batch check up to 200 words |
| Image import dedup check | `apps/mobile/.../image-import-review.page.ts` | ✅ Complete — `_checkVaultDuplicates()` called on load |
| R2 migration scripts | `apps/api/src/word-audio/migration/` | ✅ Complete — `migrate-card-audio.ts`, `cleanup-r2.ts` |

### What's still broken / missing — the actual work

**1. Audio not persisted on device after refresh**
`WordAudioService.play()` correctly falls back to Web Speech on autoplay-policy grounds (you can't await an async call and then play audio — the browser blocks it). But the background resolution that follows never downloads the file to Capacitor Filesystem. On next session, `_urlMap` is empty and the device cache is empty, so we hit the API again.

**2. No pre-generation on collection import/creation**
After a collection is imported (CSV or image), no audio is pre-generated. Users hit the generate-on-demand flow every time they first interact with a word. `CardStore.create()` and the bulk import endpoint don't trigger `WordAudioService.batchResolve()` after card creation.

**3. CSV import has zero duplicate detection**
`import-review.page.ts` (CSV flow) has no duplicate checking at all. The image import already has `_checkVaultDuplicates()`. The CSV import needs the same treatment.

**4. Dedup uses API calls instead of local store**
The existing image import dedup POSTs to `/cards/check-duplicates` on every import. Since `CardStore` already holds all the user's cards in memory, this API call is wasteful. A client-side `Map` lookup using a normalized key is O(1) and needs zero network calls.

**5. Add-word sheet has no duplicate warning**
`add-word-sheet.component.ts` has zero duplicate detection. No warning fires when a user manually types a word that already exists in their vault.

---

## 2 · Target Architecture

### Audio resolution flow (after epic)

```
User taps 🔊
    └─ WordAudioService.play()
         ├─ ① In-memory Map hit?          → play immediately
         ├─ ② Capacitor Filesystem hit?   → play immediately
         ├─ ③ GET /word-audio/lookup      → download + cache + play
         ├─ ④ Not in DB → TTS → R2 → DB → cache → play
         └─ ⑤ Fallback: Web Speech API
```

**New behaviour (AP01):** After first resolution via ③ or ④, audio is downloaded to Capacitor Filesystem in the background. All subsequent sessions hit ② immediately.

### Client-side dedup algorithm

No API call needed. `CardStore` already has all cards in memory. Build a normalized `Map` once; check in O(1).

```typescript
// shared/dedup/card-dedup.service.ts
readonly index = computed(() => {
  const map = new Map<string, Card>();
  for (const card of this.cardStore.cards()) {
    const key = this.normalizeKey(card.content.article, card.content.back);
    if (!map.has(key)) map.set(key, card);
  }
  return map;
});

check(article: string | null, back: string): Card | null {
  return this.index().get(this.normalizeKey(article, back)) ?? null;
}

private normalizeKey(article: string | null | undefined, back: string): string {
  const w = back.toLowerCase().trim();
  const a = article?.toLowerCase().trim() ?? '';
  return a ? `${a} ${w}` : w;
}
```

The index is a `computed` signal — it rebuilds automatically when `CardStore.cards()` changes.

### Pre-generation flow (collection import)

```
confirmImport() saves cards
    └─ CollectionAudioPrefetchService.prefetchCollection(cards)  [fire-and-forget]
         └─ WordAudioApiService.batchResolve(words)              [50 per chunk]
              └─ AiAudioCacheService.saveFromUrl(cacheKey, url)  [per word]
                   └─ AudioReadinessStore.markReady(cacheKey)    [reactive signal]
```

Pre-generation is **fire-and-forget**. It does not block the import confirmation. Users see their cards immediately; audio catches up within seconds.

---

## 3 · Story Map

| Ticket | Title | Phase | Pts | Depends on | Status |
|--------|-------|-------|-----|------------|--------|
| **LC-AP01** | Fix device cache write: download and persist audio after first API resolution | A — Cache | 3 | AP02 | 🔵 To do |
| **LC-AP02** | `AiAudioCacheService`: add `saveFromUrl()` for URL-based download + persist | A — Cache | 2 | — | 🔵 To do |
| **LC-AP03** | `AudioReadinessStore`: reactive signal tracking cache status per word text | A — Cache | 2 | AP02 | 🔵 To do |
| **LC-AP04** | Audio readiness dot on word-card and word-detail | A — Cache | 1 | AP03 | 🔵 To do |
| **LC-AP05** | `CollectionAudioPrefetchService`: batch-resolve + device-persist all words in a collection | B — Pregen | 3 | AP02, AP03 | 🔵 To do |
| **LC-AP06** | Wire pre-generation after CSV import confirm | B — Pregen | 1 | AP05 | 🔵 To do |
| **LC-AP07** | Wire pre-generation after image import confirm | B — Pregen | 1 | AP05 | 🔵 To do |
| **LC-AP08** | Wire pre-generation after AI collection generation | B — Pregen | 1 | AP05 | 🔵 To do |
| **LC-AP09** | Import success screen: audio generation progress bar (N/M words ready) | B — Pregen | 2 | AP05, AP03 | 🔵 To do |
| **LC-AP10** | `CardDedupService`: normalized in-memory index from `CardStore`; O(1) lookup | C — Dedup | 2 | — | 🔵 To do |
| **LC-AP11** | CSV import review: client-side dedup + duplicate row badges + summary bar | C — Dedup | 3 | AP10 | 🔵 To do |
| **LC-AP12** | Add-word sheet: inline duplicate warning on back-field blur | C — Dedup | 2 | AP10 | 🔵 To do |
| **LC-AP13** | "Use existing" path: reference existing card instead of creating duplicate | C — Dedup | 3 | AP11, AP12 | 🔵 To do |
| **LC-AP14** | Remove API call from image import dedup — migrate to `CardDedupService` | C — Dedup | 1 | AP10 | 🟡 Partial |
| **LC-AP15** | Run `migrate-card-audio.ts` on production | D — Ops | 1 | AP01 | 🔵 Ops task |
| **LC-AP16** | Run `cleanup-r2.ts` after migration verified | D — Ops | 1 | AP15 | 🔵 Ops task |

**Total: ~28 points**

---

## 4 · Story Details

### LC-AP01 · Fix device cache write

**Phase:** A — Cache  **Points:** 3  **Depends on:** AP02

**Root cause:** `WordAudioService.play()` falls back to Web Speech on autoplay-policy grounds (correct). But the background resolution that follows never calls `AiAudioCacheService.saveFromUrl()`. On next session, the device cache is empty and the API is hit again.

**Files to modify:**

| File | Change |
|------|--------|
| `shared/audio/word-audio.service.ts` | After API resolution returns `audioUrl`, call `AiAudioCacheService.saveFromUrl()` in background |
| `shared/audio/word-audio.service.ts` | On service init, warm `_urlMap` by scanning Capacitor Filesystem cache dir |

**Key pattern:**

```typescript
private async resolveAndCacheInBackground(
  text: string,
  language: string,
  cacheKey: string
): Promise<void> {
  try {
    // 1. Check device cache (may have been populated by a concurrent call)
    const deviceCached = await this.cache.getFromCache(cacheKey);
    if (deviceCached) {
      this._urlMap.set(cacheKey, deviceCached); return;
    }
    // 2. Fetch from API (backend resolves or generates)
    const resp = await this.api.resolve(text, language);
    if (!resp.wordAudio.audioUrl) return; // still generating

    // 3. Download to device and update in-memory map
    const localUrl = await this.cache.saveFromUrl(cacheKey, resp.wordAudio.audioUrl);
    this._urlMap.set(cacheKey, localUrl ?? resp.wordAudio.audioUrl);
    this.audioReadiness.markReady(cacheKey);
  } catch (err) {
    console.warn('Background audio cache failed', err);
  }
}
```

**Acceptance criteria:**
- [ ] After first play of a word (Web Speech fallback), audio is downloaded to device in background
- [ ] Second session: playing the same word hits Capacitor Filesystem immediately — no API call
- [ ] Third play same session: hits `_urlMap` in-memory — no filesystem read
- [ ] Background download failure does not crash; logged; retried on next play
- [ ] Native platform only (`isNative` guard unchanged)
- [ ] Unit test: verify `saveFromUrl()` is called after successful API resolution

---

### LC-AP02 · AiAudioCacheService — add `saveFromUrl()`

**Phase:** A — Cache  **Points:** 2  **Depends on:** —

`AiAudioCacheService` currently has `getOrDownload(storyId, remoteUrl)` and `saveBuffer(cacheKey, ArrayBuffer)`. A third method is needed: download a file from a URL using a provided cache key, decoupled from storyId naming.

**Files to modify:**

| File | Change |
|------|--------|
| `features/ai/audio/ai-audio-cache.service.ts` | Add `saveFromUrl(cacheKey, url, ext?): Promise<string \| null>` |

```typescript
async saveFromUrl(
  cacheKey: string,
  remoteUrl: string,
  ext: 'wav' | 'mp3' = 'wav'
): Promise<string | null> {
  if (!this.isNative) return remoteUrl; // web: stream directly
  const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
  await Filesystem.mkdir({ path: this.CACHE_DIR, directory: Directory.Data, recursive: true });
  await Filesystem.downloadFile({ path, url: remoteUrl, directory: Directory.Data });
  const result = await Filesystem.getUri({ path, directory: Directory.Data });
  return Capacitor.convertFileSrc(result.uri);
}
```

**Acceptance criteria:**
- [ ] Downloads and persists audio to Capacitor Filesystem; returns local URI
- [ ] On web (`isNative = false`), returns `remoteUrl` unchanged
- [ ] If file already exists at `cacheKey`, overwrites it (idempotent)
- [ ] Creates `CACHE_DIR` if it doesn't exist (recursive mkdir)

---

### LC-AP03 · AudioReadinessStore

**Phase:** A — Cache  **Points:** 2  **Depends on:** AP02

A lightweight `signalStore` tracking which words have audio ready on device. Consumed by word-card, word-detail (AP04) and the import success screen (AP09).

**Files to create:**

| File | Purpose |
|------|---------|
| `shared/audio/audio-readiness.store.ts` | `signalStore`: `Map<cacheKey, 'pending' \| 'ready' \| 'failed'>` |

```typescript
interface AudioReadinessState {
  readiness: Map<string, 'pending' | 'ready' | 'failed'>;
}

// Public API
markPending(cacheKey: string): void
markReady(cacheKey: string): void
markFailed(cacheKey: string): void
getStatus(cacheKey: string): Signal<'pending' | 'ready' | 'failed' | 'unknown'>
readyCount(cacheKeys: string[]): Signal<number>
allReady(cacheKeys: string[]): Signal<boolean>
```

**Acceptance criteria:**
- [ ] `getStatus()` returns `'unknown'` for words not yet encountered (not `'pending'`)
- [ ] Signals are reactive — components update automatically when status changes
- [ ] `readyCount()` computed signal increments as audio finishes downloading
- [ ] `providedIn: 'root'` — shared across all features

---

### LC-AP04 · Audio readiness dot on word-card and word-detail

**Phase:** A — Cache  **Points:** 1  **Depends on:** AP03

Small visual indicator on the audio play button. Dot colour signals device cache state.

| Dot colour | Meaning |
|------------|---------|
| 🟢 Green | AI audio cached on device — instant playback |
| 🟡 Amber (pulsing) | Audio generating / downloading |
| ⚫ No dot | Not yet requested — first tap will generate |

**Files to modify:**

| File | Change |
|------|--------|
| `shared/audio/audio-player/audio-player.component.ts` | Accept optional `[audioStatus]` input; render dot |
| `vault/pages/word-detail/word-detail.component.ts` | Pass `audioStatus` from `AudioReadinessStore` |
| `vault/components/word-card/word-card.component.ts` | Pass `audioStatus` from `AudioReadinessStore` |

**Acceptance criteria:**
- [ ] Green dot when `AudioReadinessStore.getStatus(cacheKey) === 'ready'`
- [ ] Amber pulsing dot when `status === 'pending'`
- [ ] No dot when `status === 'unknown'`
- [ ] Dot updates reactively without full component re-render
- [ ] Dot is decorative — does not affect play button interaction

---

### LC-AP05 · CollectionAudioPrefetchService

**Phase:** B — Pre-generation  **Points:** 3  **Depends on:** AP02, AP03

Core service for Phase B. Given a list of cards, batch-resolves all word audio URLs from the backend and downloads each to device storage. Runs entirely in the background.

**Files to create:**

| File | Purpose |
|------|---------|
| `shared/audio/collection-audio-prefetch.service.ts` | New service: `prefetchCollection(cards: Card[])` |

```typescript
@Injectable({ providedIn: 'root' })
export class CollectionAudioPrefetchService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly readiness = inject(AudioReadinessStore);

  /**
   * Fire-and-forget. Do NOT await from import flows.
   * Caller continues; audio arrives in the background.
   */
  prefetchCollection(cards: Card[]): void {
    this._run(cards).catch(err => console.warn('Audio prefetch failed:', err));
  }

  private async _run(cards: Card[]): Promise<void> {
    const words = cards.map(c => ({
      text: (c.content.article ? `${c.content.article} ` : '') + c.content.back,
      language: 'de-DE',
    }));

    // Mark all pending immediately
    words.forEach(w => {
      const key = this._cacheKey(w.text, w.language);
      this.readiness.markPending(key);
    });

    // Batch resolve in chunks of 50 (API limit)
    const CHUNK = 50;
    for (let i = 0; i < words.length; i += CHUNK) {
      const chunk = words.slice(i, i + CHUNK);
      const resp = await this.api.batchResolve(chunk);
      for (const item of resp.results) {
        if (!item.wordAudio.audioUrl) continue;
        const key = this._cacheKey(item.wordAudio.displayText, item.wordAudio.language);
        try {
          await this.cache.saveFromUrl(key, item.wordAudio.audioUrl);
          this.readiness.markReady(key);
        } catch {
          this.readiness.markFailed(key);
        }
      }
    }
  }
}
```

**Acceptance criteria:**
- [ ] `prefetchCollection()` is fire-and-forget — does not block caller
- [ ] Words chunked into batches of 50 to respect API rate limit
- [ ] Each word's status updated in `AudioReadinessStore` as it completes
- [ ] Words already in device cache are skipped (check before `saveFromUrl`)
- [ ] WiFi-only on native platform (reuse `Network.getStatus()` guard from `StoryAudioPrefetchService`)
- [ ] Failure of individual word does not stop rest of batch
- [ ] Integration test: 10-word collection → 10 files in Capacitor Filesystem after prefetch completes

---

### LC-AP06 / AP07 / AP08 · Wire pre-generation after imports

**Phase:** B — Pre-generation  **Points:** 1 pt each  **Depends on:** AP05

Three small wiring stories. Inject `CollectionAudioPrefetchService` and call `prefetchCollection()` after cards are saved. Pattern is identical for all three.

| Ticket | File to modify | Where to call `prefetchCollection()` |
|--------|----------------|--------------------------------------|
| AP06 | `vault/import/pages/import-review/import-review.page.ts` | Inside `confirmImport()` after `cardApi.create()` calls resolve |
| AP07 | `vault/import/pages/image-import-review/image-import-review.page.ts` | Inside `confirmImport()` after `cardApi.create()` calls resolve |
| AP08 | Wherever AI collection generation completes | After AI generation response; pass the created cards |

---

### LC-AP09 · Import success screen: audio progress indicator

**Phase:** B — Pre-generation  **Points:** 2  **Depends on:** AP05, AP03

After import confirmation navigates to collection detail, show a subtle progress bar: "Generating audio… 12 / 24 words ready". Disappears automatically when `allReady()` fires.

**Files to modify:**

| File | Change |
|------|--------|
| `vault/pages/collection-detail/collection-detail.page.ts` | Show audio progress using `AudioReadinessStore.readyCount()` / total |
| `vault/pages/collection-detail/collection-detail.page.html` | Progress bar component, auto-hides when all ready |

**Acceptance criteria:**
- [ ] Progress bar only shows when audio prefetch is in progress
- [ ] Bar auto-dismisses when all words are `'ready'` or `'failed'`
- [ ] Failed words show a subtle retry icon, not an error state
- [ ] Progress bar does not appear on subsequent visits (audio already cached)

---

### LC-AP10 · CardDedupService — client-side dedup index

**Phase:** C — Dedup  **Points:** 2  **Depends on:** —

All the user's cards live in `CardStore` in memory. A normalized `computed` lookup index eliminates every API call for duplicate checking.

**Files to create:**

| File | Purpose |
|------|---------|
| `shared/dedup/card-dedup.service.ts` | Index builder + lookup. Pure synchronous — no async, no HTTP. |

```typescript
@Injectable({ providedIn: 'root' })
export class CardDedupService {
  private readonly cardStore = inject(CardStore);

  // Computed: rebuilds automatically when cards change
  readonly index = computed(() => {
    const map = new Map<string, Card>();
    for (const card of this.cardStore.cards()) {
      const key = this.normalizeKey(card.content.article, card.content.back);
      if (!map.has(key)) map.set(key, card);
    }
    return map;
  });

  /** O(1) lookup. Returns existing card or null. */
  check(article: string | null, back: string): Card | null {
    return this.index().get(this.normalizeKey(article, back)) ?? null;
  }

  /** Batch check for import review rows. Reads index once — O(n) not O(n²). */
  checkBatch(words: { back: string; article?: string | null }[]): (Card | null)[] {
    const idx = this.index();
    return words.map(w => idx.get(this.normalizeKey(w.article ?? null, w.back)) ?? null);
  }

  private normalizeKey(article: string | null | undefined, back: string): string {
    const w = back.toLowerCase().trim();
    const a = article?.toLowerCase().trim() ?? '';
    return a ? `${a} ${w}` : w;
  }
}
```

**Acceptance criteria:**
- [ ] `index` is a computed signal — rebuilds when `CardStore.cards()` changes
- [ ] `check()` and `checkBatch()` are synchronous, zero async, zero HTTP
- [ ] Normalization matches backend: lowercase, trimmed, `article + " " + word` or `word` only
- [ ] `"der Hund" ≠ "die Hund"` — article is part of the key
- [ ] `checkBatch()` reads index once — O(n) not O(n²) for n-word imports
- [ ] Performance test: 1000-card vault + 50-word import batch completes in < 5 ms

---

### LC-AP11 · CSV import review — client-side dedup

**Phase:** C — Dedup  **Points:** 3  **Depends on:** AP10

`import-review.page.ts` (CSV flow) currently has zero duplicate checking. Add client-side dedup using `CardDedupService`. Mirror the pattern from `image-import-review.page.ts` but use the local index instead of the API.

**Files to modify:**

| File | Change |
|------|--------|
| `vault/import/pages/import-review/import-review.page.ts` | Call `CardDedupService.checkBatch()` on parsed rows; mark duplicates; deselect by default |
| `vault/import/pages/import-review/import-review.page.html` | Duplicate badge on rows, summary bar, within-batch indicator |

**Within-batch dedup:**

```typescript
// Check for duplicates within the batch itself (same as image-import-review)
const seen = new Map<string, number>();
rows.forEach((row, i) => {
  const key = normalize(row.article, row.back);
  if (seen.has(key)) {
    row.isDuplicate = true;
    row.duplicateSource = `row ${seen.get(key)! + 1} in this import`;
  } else {
    seen.set(key, i);
  }
});

// Check against vault using client-side index
const vaultMatches = dedupService.checkBatch(rows);
rows.forEach((row, i) => {
  const match = vaultMatches[i];
  if (match) {
    row.isDuplicate = true;
    row.duplicateCard = match;
    row.selected = false; // deselect by default
  }
});
```

**Acceptance criteria:**
- [ ] Duplicate rows show amber "Duplicate" badge with collection name from existing card
- [ ] Duplicates deselected by default; user can re-select manually
- [ ] Summary bar: "3 of 15 words already in your vault (deselected)"
- [ ] Within-batch duplicates flagged (second occurrence of same word in same CSV)
- [ ] Zero API calls for dedup — `CardDedupService.checkBatch()` only
- [ ] If all words are duplicates, import CTA still enabled (user may re-select)

---

### LC-AP12 · Add-word sheet — inline duplicate warning

**Phase:** C — Dedup  **Points:** 2  **Depends on:** AP10

**Files to modify:**

| File | Change |
|------|--------|
| `vault/components/add-word-sheet/add-word-sheet.component.ts` | On blur of back field (or article change): call `CardDedupService.check()`; set `duplicateCard` signal |
| `vault/components/add-word-sheet/add-word-sheet.component.html` | Amber warning banner + "Add anyway" / "Go to existing" actions |

**UX behaviour:**
1. User types a German word in the back field and blurs away
2. `CardDedupService.check()` runs synchronously — no debounce needed (no API call)
3. If duplicate found, show amber warning below the field:
   ```
   ⚠ "der Hund" already exists in "Chapter 6 — Restaurant"
     [Go to existing]  [Add anyway]
   ```
4. "Add anyway" dismisses the warning and allows creation
5. "Go to existing" navigates to `/vault/word/{existingCardId}` and closes the sheet

**Acceptance criteria:**
- [ ] Warning banner shows: word text, existing collection name, two action buttons
- [ ] Check is synchronous (no spinner, no debounce needed)
- [ ] No check if back field is empty
- [ ] "Add anyway" is non-blocking — warning, not a gate
- [ ] Warning dismisses when user clears the field
- [ ] Check re-fires when article changes (different article = different word)

---

### LC-AP13 · "Use existing" path on import

**Phase:** C — Dedup  **Points:** 3  **Depends on:** AP11, AP12

When a user imports a duplicate and does not deselect it, instead of creating a new card, create a collection assignment pointing to the existing card ID. The existing card's audio, SRS state, and all metadata are preserved.

```typescript
// During bulk import — for rows where isDuplicate && row.selected
if (row.isDuplicate && row.duplicateCard) {
  // Don't create a new card — assign existing card to this collection
  await collectionApi.addExistingCard(collectionId, row.duplicateCard.id);
} else {
  // Normal creation path
  await cardApi.create({ ...dto, collectionId });
}
```

**Acceptance criteria:**
- [ ] Re-selected duplicate rows create a collection assignment, not a new card
- [ ] Existing card's `audioUrl`, SRS state, and all metadata are preserved
- [ ] Backend: `POST /collections/:id/cards/:cardId` endpoint to add existing card to collection
- [ ] Import summary shows "X imported, Y already existed (reused)"

---

### LC-AP14 · Remove API call from image import dedup

**Phase:** C — Dedup  **Points:** 1  **Depends on:** AP10

`image-import-review.page.ts` currently calls `POST /cards/check-duplicates` via `wordDedupApi.checkDuplicates()`. Replace with `CardDedupService.checkBatch()` — zero API calls, same result.

**Acceptance criteria:**
- [ ] `_checkVaultDuplicates()` uses `CardDedupService.checkBatch()` instead of HTTP
- [ ] Behaviour unchanged from user perspective
- [ ] `wordDedupApi` injection removed from this component

---

### LC-AP15 / AP16 · Ops: R2 migration and cleanup

**Phase:** D — Ops  **Points:** 1 pt each  **Depends on:** AP01

These are operational tasks, not development stories. Run only after Phase A is validated on production.

| Ticket | Script | Command |
|--------|--------|---------|
| AP15 | `migrate-card-audio.ts` | `npx ts-node -r tsconfig-paths/register apps/api/src/word-audio/migration/migrate-card-audio.ts` |
| AP16 | `cleanup-r2.ts` | `npx ts-node -r tsconfig-paths/register apps/api/src/word-audio/migration/cleanup-r2.ts --confirm` |

Run AP15 first, verify all rows migrated, then run AP16. Use `--dry-run` on both before `--confirm`.

---

## 5 · Implementation Order

```
Sprint 1 (parallel tracks)
  Track 1: AP02 → AP01 → AP03 → AP04   (cache fix + status dots)
  Track 2: AP10 → AP11 + AP12 + AP14   (dedup service + all consumers)

Sprint 2
  AP05 → AP06 + AP07 + AP08 → AP09     (pregen service + wiring + progress bar)
  AP13                                  (use-existing path; needs AP11 + AP12)

Ops day (after Sprint 2 validated on staging)
  AP15 → AP16                           (R2 migration + cleanup)
```

Total estimate: 2 sprints (~2 weeks) + 1 ops run day.

---

## 6 · Success Metrics

| Metric | Current | Target (30 days post-launch) |
|--------|---------|------------------------------|
| Time to first audio play (known word, native) | ~3 s | < 200 ms |
| Audio device cache hit rate (native) | ~40% | > 90% |
| Duplicate cards per user (avg % of vault) | ~15% | < 3% |
| Audio generation trigger point | On first tap | On collection import |
| TTS API calls per unique word | ~1.4 (duplicates) | 1.0 |

---

## 7 · Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Autoplay policy blocks `Audio.play()` after background cache resolves | High | Medium | Background cache write is separate from `play()`. First play still uses Web Speech. Cached audio used on next tap (within gesture context). |
| WiFi-only guard makes pre-gen invisible on cellular | Medium | Low | On cellular, audio generates on-demand as before. Users on cellular are no worse off than today. |
| `CardDedupService.index` rebuilds during import as cards are created | Medium | Low | `checkBatch()` reads the signal once before the loop, not per word. Index rebuild is O(n) but happens once per card creation, not per word checked. |
| TTS API rate limit hit during batch pre-gen for large collections | Medium | Medium | Batch respects 5-concurrent backend limit. Rate-limited words get `status: 'failed'` with retry. Google Cloud TTS (LC-114) has much higher limits than Gemini. |
| Normalization mismatch between `CardDedupService` and `WordDedupService` | Low | High | `normalizeKey()` must match backend `normalizeWord()` exactly. Share a pure function from `@lingua-card/shared/domain` if possible. |
| Capacitor Filesystem fills up on low-storage devices | Low | Medium | `AudioCacheEvictionService` already exists for stories. Extend it to cover word audio with LRU eviction above a threshold (e.g. 100 MB). |

---

## 8 · Files Changed Summary

### New files

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/shared/audio/collection-audio-prefetch.service.ts` | Batch pre-gen + device persist for collection words |
| `apps/mobile/src/app/shared/audio/audio-readiness.store.ts` | Reactive signal store for audio cache status |
| `apps/mobile/src/app/shared/dedup/card-dedup.service.ts` | Client-side normalized dedup index from CardStore |

### Modified files

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/ai/audio/ai-audio-cache.service.ts` | Add `saveFromUrl()` method |
| `apps/mobile/src/app/shared/audio/word-audio.service.ts` | Background cache write after API resolution |
| `apps/mobile/src/app/shared/audio/audio-player/audio-player.component.ts` | Accept `[audioStatus]` input, render readiness dot |
| `apps/mobile/src/app/features/vault/pages/word-detail/word-detail.component.ts` | Pass `audioStatus` from store |
| `apps/mobile/src/app/features/vault/components/word-card/word-card.component.ts` | Pass `audioStatus` from store |
| `apps/mobile/src/app/features/vault/components/add-word-sheet/add-word-sheet.component.ts` | Client-side dedup check on blur |
| `apps/mobile/src/app/features/vault/components/add-word-sheet/add-word-sheet.component.html` | Duplicate warning banner |
| `apps/mobile/src/app/features/vault/import/pages/import-review/import-review.page.ts` | Client-side dedup + pre-gen trigger |
| `apps/mobile/src/app/features/vault/import/pages/import-review/import-review.page.html` | Duplicate badges + summary bar |
| `apps/mobile/src/app/features/vault/import/pages/image-import-review/image-import-review.page.ts` | Replace API dedup call with `CardDedupService`; add pre-gen trigger |
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.ts` | Audio progress bar |
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.html` | Progress bar component |
