# Epic: Global Word Dictionary & Admin Platform Authoring
## One canonical enriched lexicon — never enrich or voice a word twice — plus admin import of platform collections & stories

> **Epic Number:** LC-WD01 → LC-WD17  (sub-prefix `WD`, consistent with the cross-cutting `WA`/`AP` infra epics — see ADR-7)
> **Status:** 📋 Planned
> **Priority:** High
> **Estimated points:** ~55
> **Feature areas:**
> - `apps/api/src/word-dictionary/` — new NestJS module: entity, repository, service, controller
> - `apps/api/src/import/word-enrich.service.ts` — refactor to check the dictionary before any AI call
> - `apps/api/src/import/image-import.service.ts` / `image-extract.service.ts` — reorder: lookup **before** enrichment
> - `apps/api/src/stories/story-generation.service.ts` — keyword enrichment via the dictionary
> - `apps/api/src/cards/card.entity.ts` — `dictionaryWordId` link; audio resolved via the dictionary
> - `apps/api/src/admin/` — new admin module: guard + platform collection / story import
> - `apps/api/src/platform-collections/` — admin import populates these (from the LC-400 epic)
> - `apps/mobile/.../import/pages/*-review` — reuse-confirmation UX
> - `apps/mobile/.../vault/components/add-word-sheet` — dictionary-backed instant fill
> - `libs/shared/domain/src/index.ts` — `WordDictionaryEntry`, lookup/resolve contracts, admin DTOs
>
> **Depends on:** the Global Word Audio Registry (LC-WA — `word_audio`, `WordAudioService.resolve`), the Resilient Image Import two-phase flow (extract → enrich), and the Platform Vocabulary Collections epic (LC-400 — `platform_collections` / `platform_collection_words`).

---

## §0 — Context & Background

The platform already solved "generate once, reuse everywhere" — **but only for audio.** The `word_audio` table is content-addressed by `(normalizedText, language)`, has no `userId`, a unique index, inflight-dedup, and is consumed by cards, story keywords, and quizzes alike. One word → one audio file, forever, for everyone.

Enrichment never got the same treatment. Every AI enrichment — image import Phase 2, CSV import, story keywords, the add-word sheet's "auto-generate" — calls the model fresh, even for words the platform has already enriched a thousand times. Worse, the image flow **enriches before it deduplicates**: it extracts raw words, enriches *all* of them in batches of 10, and only at the review screen checks them against the user's vault. Words the user (or anyone) already has are paid for in tokens, then thrown away.

This epic introduces the missing half: a **Global Word Dictionary** — a canonical, cross-user lexicon of enriched German words that does for enrichment exactly what `word_audio` does for audio, and that **every entry point checks before calling AI.** It links each canonical word to its single audio record, so a word carries both its meaning and its voice, generated once and shared by all users.

It also adds the **admin authoring** the request calls for: a manual flow for an admin to import platform collections (which flow through the dictionary, so re-importing overlapping topics is free for known words), plus the documented **AI prompt** an admin feeds to a model to generate platform *stories* from a collection, and an endpoint to import the result.

### The user's requirements, mapped

| Requirement | Mechanism in this epic |
|---|---|
| One dictionary of enriched German words, reused across the whole app | `word_dictionary` table + `WordDictionaryService` (ADR-1) |
| Check existence **before** enriching; no word enriched twice | `resolve()` / `batchResolve()` lookup-before-generate; image flow reordered (LC-WD03–05) |
| Every word audio linked to the word; never generated twice | `word_dictionary.wordAudioId → word_audio.id` (ADR-3); existing registry untouched |
| Dictionaries reused across **all users**, not per-user | No `userId` on `word_dictionary` / `word_audio`; per-user data is only the card + SRS (ADR-2) |
| On collection import, ask the user to confirm reuse of existing | Import-review "known to platform — reuse?" step (LC-WD09) |
| On manual enrich, check the dictionary before calling AI | `enrichOne` → `WordDictionaryService.resolve` (LC-WD04, LC-WD10) |
| Admin manually imports platform collections | Admin import endpoint + UI (LC-WD11–12, LC-WD14) |
| Prompt to generate platform stories (run manually) | Documented prompt artifact + import-story endpoint (LC-WD13) |

### Research grounding

The "check a shared cache before the expensive call" pattern is the textbook **semantic cache** / **content-addressable storage** design: the cache is consulted *before* the model is invoked, a hit returns the stored result and skips the call entirely, and entries are keyed by a normalized content hash with a global index so identical inputs collapse to one stored object (LLVM CAS; content-aware caching; semantic-cache literature). The existing `word_audio` registry is already this pattern; the dictionary simply extends it from "what is spoken" to "what is known about the word."

---

## §0.1 — Pre-flight verification (run before any code)

```bash
# 1. Confirm enrichment currently calls AI with no shared-lexicon lookup.
rg -n "openRouter.generateText" apps/api/src/import/word-enrich.service.ts
#    Expect: a direct model call inside enrichBatch / enrichOne, no dictionary check.

# 2. Confirm the image flow enriches BEFORE the vault dedup (the token-waste bug).
rg -n "enrichWords|_checkVaultDuplicates" apps/mobile/src/app/features/vault/import -l
#    Expect: enrichment (Phase 2) precedes _checkVaultDuplicates() on the review page.

# 3. Confirm the audio registry is already global (no userId) and content-addressed.
rg -n "userId|normalizedText|@Unique" apps/api/src/word-audio/word-audio.entity.ts
#    Expect: @Unique(['normalizedText','language']); NO userId column.

# 4. Confirm dedup today is per-user only (the gap this epic closes for enrichment).
rg -n "userId" apps/api/src/cards/word-dedup.service.ts
rg -n "CardStore.cards" apps/mobile/src/app/shared/dedup/card-dedup.service.ts

# 5. Confirm the normalization helpers that must be unified.
rg -n "normalizeForAudio|normalizeKey|normalizeWord" apps/ -l
#    Expect: multiple, slightly-different normalizers — unify into one (ADR-5).

# 6. Confirm platform collection tables exist (admin import target, from LC-400).
rg -n "platform_collection" apps/api/src -l

# 7. Confirm there is no admin guard yet (admin is manual SQL today).
rg -n "AdminGuard|isAdmin|role" apps/api/src/auth -l
```

If finding #3 shows a `userId` on `word_audio`, **stop and revise ADR-2** — the cross-user sharing premise needs re-checking.

---

## §1 — Observed problems

| # | Problem | Evidence |
|---|---|---|
| P1 | **Enrichment tokens wasted on known words** — image import enriches all extracted words before checking the vault | Phase 2 `enrichWords` runs before `_checkVaultDuplicates()` |
| P2 | **No shared enrichment** — the same word is re-enriched for every user, every import | `WordEnrichService` calls the model directly, no lexicon |
| P3 | **Dedup is per-user only** — the platform can't answer "do we already know this word" | `WordDedupService` / `CardDedupService` scoped to one vault |
| P4 | **Audio and meaning are decoupled** — audio is global, enrichment is not, and a card links to neither canonically | `word_audio` global; `card.content` carries an inline copy |
| P5 | **No admin authoring** — platform collections/stories can only be created by SQL | No admin module |
| P6 | **Fragmented normalization** — audio, vault dedup, and within-batch dedup use different keys | `normalizeForAudio` vs `normalizeKey` vs ad-hoc |

---

## §2 — System analysis (live source)

### 2.1 — Audio: already global (the model to copy)

```typescript
@Entity('word_audio')
@Unique(['normalizedText', 'language'])     // ← no userId: global, cross-user
export class WordAudioEntity { /* normalizedText, displayText, audioUrl, status… */ }
```
`WordAudioService.resolve()` returns existing audio on a normalized hit (no TTS), generates exactly once otherwise, and dedups concurrent generations via an inflight `Map`. **This is precisely the shape the dictionary needs.**

### 2.2 — Enrichment: per-call, no lexicon (the gap)

`WordEnrichService.enrichWords()` chunks raw words into batches of 10 and calls `openRouter.generateText()` for each — unconditionally. `enrichOne()` (add-word sheet) does the same for one word. Neither consults any store first. There is no table of "words we have already enriched."

### 2.3 — The token-waste ordering

Image import: `image-extract` (Phase 1, raw words) → `word-enrich` (Phase 2, enrich **all**) → review page `_checkVaultDuplicates()` (per-user). The dedup that could have skipped the enrichment runs *after* the enrichment has already been paid for.

### 2.4 — Card content is an inline copy

`CardEntity.content` is a jsonb blob (front, article, gender, examples, phonetic, …). It has no link to a canonical word, so two users with "der Apfel" hold two independently-enriched copies and (pre-`word_audio`) two audio files.

---

## §3 — Target architecture

### 3.1 — The hub: `word_dictionary`

A canonical enriched lexeme, global, content-addressed, linked to its audio. **No `userId`.**

```
word_dictionary
──────────────────────────────────────────────
id              (pk)
lemmaKey        normalize("article + base"), idx       e.g. "der apfel"
targetLang      "de-DE"   ┐ part of the unique key
nativeLang      "en"      ┘ (translations are native-language-specific)
displayText     "Apfel"
article         der|die|das|null
gender          masc|fem|neut|null
translation     "apple"
wordType        noun|verb|adjective|adverb|other
phonetic        "ˈʔap͡fl̩"  (nullable)
cefrLevel       A1|A2|…|C1|null
categoryName    "Food"
examples        jsonb [{ target, native }]
synonyms        jsonb   (aligns with planned synonyms/plurals backfill)
plurals         jsonb
wordAudioId     fk → word_audio.id   (the single audio for this word)  ── ADR-3
source          'ai-enrich' | 'admin' | 'story-extract'
model           model string used (provenance)
enrichedAt      timestamptz
UNIQUE (lemmaKey, targetLang, nativeLang)
```

### 3.2 — The single service: `WordDictionaryService`

The one place the rest of the app asks "what do we know about this word?" — mirroring `WordAudioService`.

```typescript
@Injectable()
export class WordDictionaryService {
  private readonly inflight = new Map<string, Promise<WordDictionaryEntity>>();

  /** Pure lookup — never calls AI. Returns the canonical entry or null. */
  async lookup(text: string, article: string | null, target='de-DE', native='en'): Promise<WordDictionaryEntry | null> {
    const key = normalizeLemma(text, article);             // ← shared normalizer (ADR-5)
    const row = await this.repo.findByKey(key, target, native);
    return row ? this.toModel(row) : null;
  }

  /** Resolve one word: reuse on hit, enrich exactly once on miss, link audio. */
  async resolve(raw: RawWordInput, target='de-DE', native='en'): Promise<{ entry: WordDictionaryEntry; reused: boolean }> {
    const key = normalizeLemma(raw.back, raw.article);
    const hit = await this.repo.findByKey(key, target, native);
    if (hit) return { entry: this.toModel(hit), reused: true };       // ← zero AI tokens

    const inflightKey = `${target}:${native}:${key}`;
    if (this.inflight.has(inflightKey)) {
      return { entry: this.toModel(await this.inflight.get(inflightKey)!), reused: true };
    }
    const gen = this.enrichAndPersist(raw, key, target, native);
    this.inflight.set(inflightKey, gen);
    try { return { entry: this.toModel(await gen), reused: false }; }
    finally { this.inflight.delete(inflightKey); }
  }

  /** Batch: split into hits (reuse) and misses (enrich once), persist, return all + counts. */
  async batchResolve(raws: RawWordInput[], target='de-DE', native='en'): Promise<BatchResolveResult> {
    const keys = raws.map(r => normalizeLemma(r.back, r.article));
    const existing = await this.repo.findByKeys(keys, target, native);   // one query
    const misses = raws.filter((_, i) => !existing.has(keys[i]));
    const enriched = misses.length ? await this.enrichBatchOnce(misses, target, native) : [];
    await this.linkAudioFor([...existing.values(), ...enriched]);        // via WordAudioService.batchResolve
    return { entries: /* merged in input order */, reused: existing.size, enriched: enriched.length };
  }

  private async enrichAndPersist(raw, key, target, native) {
    const data = await this.wordEnrich.enrichRaw(raw, target, native);   // the ONLY place AI runs
    const audio = await this.wordAudio.resolve(displayWithArticle(raw), target);  // generate-once audio
    return this.repo.save(this.repo.create({ ...data, lemmaKey: key, wordAudioId: audio.wordAudio.id, source: 'ai-enrich', model: data.model }));
  }
}
```

### 3.3 — Every entry point checks the dictionary first

```
                         ┌──────────────────────────┐
   Image import ───┐     │   WordDictionaryService  │
   CSV import ─────┤     │   lookup / resolve /     │     ┌───────────────┐
   Add-word sheet ─┼────▶│   batchResolve           │────▶│ word_dictionary│ (enrich once)
   Story keywords ─┤     │   (lookup BEFORE AI)     │     └───────┬───────┘
   Admin import ───┘     └──────────────────────────┘             │ wordAudioId
                                                                   ▼
                                                            ┌────────────┐
                                                            │ word_audio │ (voice once)
                                                            └────────────┘
```

- **Image import (P1 fix):** after Phase 1 extraction, `batchResolve` the raw words. Hits return enriched data with **zero tokens**; only misses are enriched. Dedup-before-enrich, by construction.
- **Add-word sheet:** `resolve` one word → if known, fill the card instantly with no spinner ("from library"); else enrich once and add to the dictionary.
- **Story keywords:** `mergeKeywords` consults `lookup` before AI classification.
- **Admin import:** the same `batchResolve` — re-importing an overlapping topic costs nothing for known words.

### 3.4 — Per-user stays per-user; canonical stays shared

A user's **card** still owns its editable `content` (copied from the dictionary on create) and its private SRS — but gains `dictionaryWordId` (nullable FK) for provenance and audio resolution. We **copy, not reference**, the enrichment into the card so user edits never mutate shared data; the link is for audio reuse, traceability, and future re-sync (ADR-4). Audio is never copied — the card resolves it through `dictionaryWordId → wordAudioId`.

### 3.5 — Two dedup questions, one surface

| Question | Answered by | UX on import review |
|---|---|---|
| "Is this already in **my** vault?" | per-user `WordDedupService` (kept) | Amber "Already in your vault" → deselected |
| "Does the **platform** already know this word?" | `WordDictionaryService.lookup` (new) | "Known — reuse (no AI)?" toggle, **on** by default |

The request's "ask the user to confirm if they want to reuse the existing" is the second row: reuse is the default (free, instant); the user may opt to force a fresh enrichment.

---

## §4 — Story map

| Phase | Ticket | Title | Pts | Depends on |
|---|---|---|---|---|
| 0 — Domain | **LC-WD01** | Shared types: `WordDictionaryEntry`, lookup/resolve contracts, admin DTOs | 2 | — |
| 1 — Dictionary core | **LC-WD02** | `WordDictionaryEntity` + repository + migration (unique key, audio FK) | 3 | WD01 |
| 1 — Dictionary core | **LC-WD03** | `WordDictionaryService` — lookup / resolve / batchResolve + inflight + audio link | 5 | WD02 |
| 1 — Dictionary core | **LC-WD04** | Refactor `WordEnrichService` (`enrichWords` + `enrichOne`) through the dictionary | 5 | WD03 |
| 1 — Dictionary core | **LC-WD05** | Reorder image import: lookup **before** enrichment (P1 token-waste fix) | 3 | WD04 |
| 1 — Dictionary core | **LC-WD06** | Story keyword enrichment via the dictionary | 2 | WD03 |
| 1 — Dictionary core | **LC-WD07** | Card linkage: `dictionaryWordId` on `CardEntity`; audio resolved via dictionary | 3 | WD03 |
| 2 — Unified dedup | **LC-WD08** | One normalizer + one `DedupService` consulted by all entry points | 3 | WD03 |
| 2 — Unified dedup | **LC-WD09** | Import review: "known to platform — reuse?" confirmation (+ existing vault-dup) | 5 | WD05, WD08 |
| 2 — Unified dedup | **LC-WD10** | Add-word sheet: dictionary-backed instant fill (no AI on hit) | 3 | WD04 |
| 3 — Admin authoring | **LC-WD11** | Minimal admin auth: `isAdmin` flag + `AdminGuard` | 2 | — |
| 3 — Admin authoring | **LC-WD12** | Admin import platform collection (CSV/JSON → dictionary → `platform_collections`) | 5 | WD03, WD11, LC-400 |
| 3 — Admin authoring | **LC-WD13** | Platform story prompt (documented) + admin import-story endpoint | 3 | WD11 |
| 3 — Admin authoring | **LC-WD14** | Admin authoring UI (import screens, reuse summary, status) | 3 | WD12, WD13 |
| 4 — Migration & ops | **LC-WD15** | Backfill dictionary from existing cards (dedup + audio link) | 5 | WD03, WD07 |
| 4 — Migration & ops | **LC-WD16** | Analytics: enrichment cache-hit rate + token savings | 2 | WD03 |
| 5 — Docs | **LC-WD17** | Update `CLAUDE.md` (dictionary, admin module, endpoints, store ownership) | 1 | all |

**Total: 55 points.**

### Implementation order

```
WD01 → WD02 → WD03 ─┬─► WD04 → WD05 → WD09
                    ├─► WD06
                    ├─► WD07 → WD15
                    └─► WD08 → WD09 / WD10
WD11 ─► WD12 ─► WD14
        WD13 ─┘
WD16 (any time after WD03) · WD17 (last)
```

WD03 is the keystone — nothing reuses enrichment until it lands. WD05 (the token-waste fix) and WD09 (reuse UX) are the visible wins; sequence them early after WD04.

---

## §5 — Ticket details (selected)

### LC-WD01 · Shared domain types
**Phase:** 0 · **Points:** 2 · **Depends on:** nothing

```typescript
export interface WordDictionaryEntry {
  id: string;
  lemmaKey: string;
  displayText: string;
  article: 'der' | 'die' | 'das' | null;
  gender: GenderType;
  translation: string;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  phonetic: string | null;
  cefrLevel: CefrLevel | null;
  categoryName: string;
  examples: ExampleSentence[];
  synonyms: Synonym[];
  plurals: string[];
  wordAudioId: string | null;
  targetLang: string;
  nativeLang: string;
  source: 'ai-enrich' | 'admin' | 'story-extract';
}

export interface RawWordInput { back: string; article: 'der'|'die'|'das'|null; }

export interface DictionaryLookupRequest { text: string; article?: string|null; targetLang?: string; nativeLang?: string; }
export interface DictionaryResolveResult { entry: WordDictionaryEntry; reused: boolean; }
export interface DictionaryBatchResolveResult { entries: WordDictionaryEntry[]; reused: number; enriched: number; }

// Admin
export interface AdminImportCollectionDto { level: CefrLevel; topic: CollectionTopic; title: string; emoji?: string; words: RawWordInput[]; reuseExisting?: boolean; }
export interface AdminImportStoryDto { platformCollectionId: string; story: GeneratedPlatformStory; }
```

**AC:** all types exported from the barrel; `npx tsc --noEmit` green; `CardContent` gains an optional `dictionaryWordId?: string | null` comment noting the link.

---

### LC-WD03 · `WordDictionaryService` (keystone)
**Phase:** 1 · **Points:** 5 · **Depends on:** WD02

Implements `lookup`, `resolve`, `batchResolve` exactly as §3.2: lookup-before-AI, inflight dedup on misses, audio linked via `WordAudioService` so the canonical word and its voice are created in the same resolve.

**AC**
- [ ] `lookup()` never calls AI; returns the entry or null on a normalized-key hit.
- [ ] `resolve()` on a hit makes **zero** enrichment + zero TTS calls; on a miss enriches once, persists, links audio once.
- [ ] Concurrent `resolve()` for the same word awaits one promise (no double enrichment).
- [ ] `batchResolve()` issues **one** lookup query, enriches only misses, returns `{ reused, enriched }` counts.
- [ ] Unique `(lemmaKey, targetLang, nativeLang)` enforced at DB level; a race that loses the insert falls back to the existing row.
- [ ] Every persisted entry has a non-null `wordAudioId` once audio resolves (or `pending` per the audio registry's own status).

---

### LC-WD04 · Refactor `WordEnrichService` through the dictionary
**Phase:** 1 · **Points:** 5 · **Depends on:** WD03

`enrichWords()` becomes a thin caller of `dictionary.batchResolve()`; `enrichOne()` becomes `dictionary.resolve()`. The raw model-calling code moves *behind* the dictionary as `enrichRaw()` / `enrichBatchOnce()` (the only place AI enrichment runs). Public DTOs/endpoints keep their shapes (backwards-compatible).

**AC**
- [ ] `POST /import/enrich` returns the same `EnrichWordsResult` shape but now reports reuse; already-known words consume no tokens.
- [ ] `POST /import/enrich-one` fills from the dictionary on a hit with no AI call.
- [ ] The batch path enriches misses in groups of 10 as before; the rate-limit/partial behaviour is preserved.
- [ ] No caller of the model exists outside `enrichRaw`/`enrichBatchOnce`.

---

### LC-WD05 · Reorder image import — lookup before enrichment
**Phase:** 1 · **Points:** 3 · **Depends on:** WD04

After Phase 1 extraction, run `batchResolve` (which looks up first). Only true misses reach the model. The processing screen reports "reused N · enriching M."

**AC**
- [ ] For an image whose words are all already known, **zero** enrichment tokens are spent.
- [ ] The processing UI shows reused vs newly-enriched counts.
- [ ] The two-phase resilient flow (partial recovery, resume) still works for the miss set only.
- [ ] Server log records tokens-saved = reused × avg-enrich-cost.

---

### LC-WD07 · Card linkage + audio via dictionary
**Phase:** 1 · **Points:** 3 · **Depends on:** WD03

Add nullable `dictionaryWordId` to `CardEntity` (+ migration). On card creation from any enriched source, copy the dictionary entry's content into `card.content` **and** set `dictionaryWordId`. Audio resolution reads `dictionaryWordId → wordAudioId` instead of re-keying by card text.

**AC**
- [ ] New cards from import/add-word carry `dictionaryWordId`.
- [ ] Editing a card's content does **not** mutate the dictionary entry (copy, not reference).
- [ ] Audio for a linked card resolves via the dictionary's `wordAudioId` (no second lookup by text).
- [ ] Existing cards (`dictionaryWordId = null`) keep working via the legacy text-keyed audio path.

---

### LC-WD08 · One normalizer, one dedup surface
**Phase:** 2 · **Points:** 3 · **Depends on:** WD03

Introduce a single `normalizeLemma(text, article)` in shared and route `word_audio`, `word_dictionary`, per-user vault dedup, and within-batch dedup through it. Keep `WordDedupService` (per-user "in my vault") and add the dictionary lookup ("known to platform") as the second signal — both behind one client `DedupService` facade.

**AC**
- [ ] `"der Apfel"`, `"Der Apfel"`, `"der apfel."` all normalize identically across audio, dictionary, and vault dedup.
- [ ] One facade exposes both `inMyVault(word)` and `knownToPlatform(word)`.
- [ ] No component computes its own normalization key anymore.

---

### LC-WD09 · Import review — reuse confirmation
**Phase:** 2 · **Points:** 5 · **Depends on:** WD05, WD08

The CSV and image review screens show, per word, two independent signals: **Already in your vault** (deselected by default — a warning) and **Known to platform — reuse** (a toggle, **on** by default; off forces fresh enrichment). A summary banner: "24 reused · 6 new · 3 already in your vault."

**AC**
- [ ] Words known to the platform show a "reuse" toggle, on by default; toggling off marks them for fresh enrichment.
- [ ] Vault duplicates remain deselected-by-default warnings (independent of the reuse toggle).
- [ ] The confirm action enriches only words that are misses **and** not toggled to reuse.
- [ ] Summary counts are accurate and update as toggles change.
- [ ] CSV and image flows share the same component (no divergence).

---

### LC-WD11 · Minimal admin auth
**Phase:** 3 · **Points:** 2 · **Depends on:** nothing

Add `isAdmin boolean default false` to `UserEntity` (+ migration; flip via the existing manual-SQL workflow). Add a functional `AdminGuard` that 403s non-admins. All `/admin/*` routes sit behind it.

**AC**
- [ ] `AdminGuard` rejects non-admin JWTs with 403.
- [ ] `isAdmin` defaults false; set manually (consistent with subscription activation).
- [ ] No admin capability leaks onto non-admin endpoints.

---

### LC-WD12 · Admin import platform collection
**Phase:** 3 · **Points:** 5 · **Depends on:** WD03, WD11, LC-400

`POST /admin/platform-collections/import` accepts `AdminImportCollectionDto` (CSV parsed client-side into `words[]`, or raw JSON). It runs `dictionary.batchResolve(words)` (reuse-first), then creates a `platform_collection` + `platform_collection_words` (from the LC-400 schema) referencing the dictionary entries. Response reports `{ created, reused, enriched }`.

**AC**
- [ ] Import enriches only words not already in the dictionary; reports reused vs enriched.
- [ ] Re-importing an overlapping topic spends zero enrichment tokens on the overlap.
- [ ] Each `platform_collection_words` row is backed by a dictionary entry (and therefore an audio record).
- [ ] Word count + level/topic set correctly; collection starts `isPublished=false` (admin publishes after review).
- [ ] Endpoint is admin-guarded.

---

### LC-WD13 · Platform story prompt + import endpoint
**Phase:** 3 · **Points:** 3 · **Depends on:** WD11

Ship the **canonical platform-story prompt** (below) as a documented artifact the admin pastes into an AI tool, plus `POST /admin/platform-stories/import` accepting the returned JSON and saving it as a platform-owned story attached to a platform collection.

#### The platform-story generation prompt (copy-paste, run manually)

> Fill the three `{{…}}` slots. The output JSON matches the import endpoint exactly. The prompt is deliberately firm, with correct/incorrect examples, per our prompt-engineering standard.

```
ROLE: You are a German-language curriculum writer producing a CANONICAL platform story
for a vocabulary app. This story will be shown to MANY learners, so it must be correct,
natural, and tightly scoped to the supplied word list.

TARGET CEFR LEVEL: {{LEVEL}}      // one of A1, A2, B1, B2, C1
TOPIC: {{TOPIC}}                   // e.g. "Food & Drink"
WORD LIST (use these exact words; do not invent vocabulary beyond what this level needs):
{{WORD_LIST}}                      // newline list: "der Apfel = apple", "bestellen = to order", …

HARD RULES
1. Use AT LEAST 80% of the WORD LIST. Every listed word that appears must be in a NATURAL,
   everyday context — never a словарь-style filler sentence.
   ✅ CORRECT: "Im Café bestellt Lena einen Apfelsaft und ein Stück Kuchen."
   ❌ INCORRECT: "Der Apfel ist ein Apfel. Ich bestelle bestellen." (unnatural, forced)
2. Stay strictly at CEFR {{LEVEL}}. For A1/A2: short main clauses, present and simple past,
   no subjunctive, no passive. Higher levels may add subordinate clauses / tenses as the
   level allows. Do NOT exceed the level to sound impressive.
3. Words must appear in CORRECT grammatical form — right article, case, and conjugation.
   ✅ "Sie gibt dem Kellner das Trinkgeld."  (dative)
   ❌ "Sie gibt der Kellner die Trinkgeld."
4. Write a COMPLETE arc (beginning → middle → end) of 8–16 sentences for short,
   16–28 for medium. Include natural dialogue where it fits.
5. Provide an English translation for every sentence and a title translation.
6. Do NOT add words to hit a quota — only natural usage counts toward the 80%.

OUTPUT — valid JSON ONLY, no markdown fences, no commentary:
{
  "title": "German title",
  "titleTranslation": "English title",
  "level": "{{LEVEL}}",
  "topic": "{{TOPIC}}",
  "sentences": [
    { "german": "…", "english": "…", "wordsUsed": ["Apfel", "bestellen"] }
  ],
  "keywords": [
    { "germanBase": "Apfel", "article": "der", "english": "apple",
      "wordType": "noun", "level": "A1" }
  ]
}
```

The import endpoint maps `keywords[]` through `dictionary.lookup` (reuse) before saving, so platform-story keywords share the same canonical entries and audio.

**AC**
- [ ] The prompt is documented in-repo (`apps/api/src/admin/prompts/platform-story.prompt.md`) and in this epic.
- [ ] `POST /admin/platform-stories/import` validates the JSON shape and rejects malformed input with a clear error.
- [ ] Imported keywords are resolved through the dictionary (reuse, not re-enrich).
- [ ] The saved story is platform-owned and attached to the given `platformCollectionId`.
- [ ] Endpoint is admin-guarded.

---

### LC-WD15 · Backfill the dictionary from existing cards
**Phase:** 4 · **Points:** 5 · **Depends on:** WD03, WD07

An idempotent script walks existing cards, normalizes each, upserts a dictionary entry (first writer wins), links audio, and stamps `dictionaryWordId` back onto the card. Runs in batches; safe to re-run.

**AC**
- [ ] After the run, every distinct normalized word across all users has exactly one dictionary entry.
- [ ] Cards are linked (`dictionaryWordId` set) where a match exists.
- [ ] Re-running creates no duplicates and re-links nothing already linked.
- [ ] A dry-run mode reports counts without writing.

---

## §6 — Architecture Decision Records

### ADR-1 — A dedicated `word_dictionary` registry (mirror `word_audio`), not ad-hoc caching
**Decision:** Introduce a first-class canonical-lexeme table + service, structurally identical to the proven `word_audio` registry.
**Rationale:** Enrichment is the expensive, repeated, content-identical operation `word_audio` already taught us to collapse. A real table (vs a TTL/Redis cache) gives durability, a unique key that makes "enriched twice" impossible at the DB level, joinability to audio and cards, and queryability for analytics. Research (semantic cache / CAS) endorses check-before-generate with a global content-addressed index.

### ADR-2 — Global, cross-user dictionary (no `userId`); per-user data is only the card + SRS
**Decision:** `word_dictionary` (like `word_audio`) has no owner. What's enriched/voiced is shared by everyone; only the card row and its SRS are per-user.
**Rationale:** The word "der Apfel" is the same fact for every learner — owning it per-user is exactly the duplication this epic removes. Privacy is unaffected: the dictionary holds dictionary facts, not user content. (The older `word_audio` epic listed cross-user sharing as "future" out of caution, but the entity already ships with no `userId`, so we are formalizing the model that's already in place.)

### ADR-3 — Link, don't fold: dictionary `wordAudioId → word_audio`
**Decision:** Keep audio in its own registry; the dictionary references it by FK. The two are keyed differently — audio by `(normalizedText, language)` (native-language-independent), the dictionary by `(lemmaKey, targetLang, nativeLang)` (translations are native-specific).
**Rationale:** A word's *voice* doesn't change with the learner's native language, but its *translation* does. Separate keys with one link keeps both correct and avoids re-voicing a German word per native language.

### ADR-4 — Cards copy enrichment (not reference it), but keep the link
**Decision:** On card creation, copy the dictionary entry into the editable `card.content`; store `dictionaryWordId` for audio reuse, provenance, and future re-sync. Audio is referenced (never copied).
**Rationale:** Cards are user-editable; a pure reference would either forbid edits or leak edits into shared data. Copy-on-create preserves the existing card model and user autonomy while still reusing enrichment (the copy is free — the AI ran at most once) and audio (truly shared).

### ADR-5 — One `normalizeLemma`, used everywhere
**Decision:** A single shared normalizer keys audio, dictionary, vault dedup, and within-batch dedup.
**Rationale:** Today three slightly-different normalizers mean a word can be "the same" for audio but "different" for dedup. One function makes every "same word" judgment consistent — the precondition for the whole reuse story to hold.

### ADR-6 — Reuse is default; the user may force fresh enrichment
**Decision:** On import, known words reuse the dictionary by default (free, instant); a per-word toggle lets the user force a fresh enrichment.
**Rationale:** Satisfies the request's "ask the user to confirm reuse" while defaulting to the cheap, correct path. Forcing fresh is an escape hatch for rare cases (a bad earlier enrichment), not the norm.

### ADR-7 — Sub-prefix `LC-WD`, consistent with `LC-WA` / `LC-AP`
**Decision:** Cross-cutting infrastructure epics use a letter sub-prefix rather than a hundred-block. This one is `WD`.
**Rationale:** It's infrastructure consumed by many features (like `WA` audio, `AP` persistence), not a single-surface feature like the Vault (200) or Story Studio (300). The prefix avoids colliding with feature hundred-blocks and signals "shared infra." (Highest feature ticket remains LC-400-block from the Platform Collections epic; `WD` sits alongside, not after.)

---

## §7 — Non-goals (explicitly out of scope)

- **Semantic / fuzzy dedup** — match is exact on the normalized lemma only ("Apfel" vs "Äpfel" are distinct unless the plurals field links them). Lemmatization/stemming is a future enhancement.
- **Per-native-language re-voicing** — audio stays native-language-independent (ADR-3).
- **Editing the dictionary from the client** — only admin import and AI enrichment write to it; users edit their own cards.
- **Multi-voice / speed variants** — single canonical audio per word (unchanged from the audio epic).
- **Real-time admin AI generation** — platform stories are generated *manually* via the documented prompt; the app only imports the result.
- **Cross-target-language dictionary** — scoped to German (`de-DE`) target; the schema carries `targetLang` for the future but no other target is seeded.
- **Re-sync of cards when a dictionary entry improves** — the link makes it possible; the migration is deferred.
- **A full web admin console** — LC-WD14 ships minimal import screens; a richer admin app is out of scope.
