# Epic: Platform Vocabulary Collections — Refined
## Explore curated CEFR sets in the Vault · dictionary-backed · instant AI-free adoption

> **Epic Number:** LC-400 (tickets LC-403–415)
> **Status:** 🔄 Refined — post-codebase investigation, June 2026
> **Priority:** High
> **Estimated points remaining:** ~40
> **Supersedes:** the original LC-400 epic (pre-dictionary). This document is the ground truth.
>
> **Feature areas:**
> - `apps/api/src/platform-collections/` — new public (user-facing) module; admin entities stay in `admin/`
> - `apps/api/src/admin/` — publish toggle + list (gap: collections import as `isPublished:false` and can never go live)
> - `apps/api/src/collections/` — adopted-collection provenance
> - `apps/mobile/src/app/features/vault/` — Explore segment, shelves, detail, adopt flow
> - `libs/shared/domain/src/index.ts` — public browse/adopt contracts
>
> **Depends on (all ✅ shipped):** Global Word Dictionary (`WordDictionaryService`, `word_dictionary`, card `dictionaryWordId`), Word Audio Registry, Admin import module (`/admin/platform-collections/import*`, `/admin/platform-stories/import`), Platform Stories (`GET /platform-stories`, Explore UI, `UserStoryProgressEntity`), Vault tab rail + contextual action bar.

---

## §0 — Investigation summary: what changed since v1

The original epic was written before the Global Word Dictionary existed. The dictionary epic (LC-WD) shipped **and absorbed several LC-400 tickets** — with a *better* schema than v1 proposed. Ground truth from live source:

| v1 Ticket | v1 Plan | **Actual state** |
|---|---|---|
| LC-400 — domain types | Browse/adopt + denormalized word types | 🔶 **Partial** — admin DTOs shipped; public browse/adopt contracts missing |
| LC-401 — entities | `platform_collection_words` with denormalized word fields | ✅ **Done, better** — words are **`dictionaryWordId` references** (`apps/api/src/admin/platform-collection-*.entity.ts`). No slug/description/colour; `topic` is free-text varchar(80) |
| LC-402 — seed script | Hardcoded seed | ✅ **Superseded** — admin import UI + endpoints (LC-WD12/14) with reuse-first dictionary resolve and a copyable enrichment prompt |
| LC-403 — public list/detail endpoints | Planned | ❌ **Not started** — only admin import endpoints exist; **users cannot see platform collections at all** |
| LC-404 — adopt endpoint | Clone from denormalized words, dedup by normalized base | ❌ **Not started** — and the design improves: clone **from dictionary entries**, AI-free, audio pre-linked |
| LC-405 — collection provenance | `sourcePlatformCollectionId` + level/topic on `CollectionEntity` | ❌ **Not started** (mobile `Collection` model confirms fields absent) |
| LC-406–412 — mobile store + UI | Planned | ❌ **Not started** |
| — | — | 🐛 **NEW gap:** admin import saves `isPublished:false`; **no publish/list endpoint exists** — imported collections are permanently invisible |
| — | — | ✨ **NEW capability:** Story Studio shipped `GET /platform-stories` + Explore shelves + `UserStoryProgressEntity` — collections can pair with stories, and the Explore browse pattern is already a learned mental model |

### What the shipped architecture unlocks (this drives the refined UX)

1. **Adoption is now AI-free and instant.** A platform word *is* a dictionary entry — article, translation, examples, synonyms, plurals, CEFR level, and `wordAudioId` all exist already. Adopting = copying dictionary content into cards (per the dictionary epic's copy-not-reference rule) and stamping `dictionaryWordId`. Zero enrichment tokens, zero TTS, no spinner.
2. **"You already know N of M" is an exact join, not a guess.** User cards carry `dictionaryWordId`; platform words carry `dictionaryWordId`. Overlap = set intersection. v1 could only fuzzy-match normalized text.
3. **Per-word CEFR level exists** in the dictionary → we can infer the user's working level from their vault and default the Explore filter to it.
4. **Platform stories share the level taxonomy** → a collection detail can surface real stories to read *now*, before/alongside generating a personal one.

---

## §0.1 — Pre-flight verification

```bash
# 1. Confirm platform words are dictionary references (the architectural pivot).
rg -n "dictionaryWordId" apps/api/src/admin/platform-collection-word.entity.ts

# 2. Confirm there is NO public read endpoint for platform collections.
rg -rn "platform-collections" apps/api/src --glob '!**/admin/**' -l
#    Expect: nothing user-facing. Only admin import routes exist.

# 3. Confirm the publish gap: import sets isPublished:false; no publish/list admin route.
rg -n "isPublished" apps/api/src/admin/admin.service.ts
rg -n "@Post|@Patch|@Get" apps/api/src/admin/admin.controller.ts
#    Expect: three POST imports only.

# 4. Confirm user cards carry dictionaryWordId (enables the exact known-overlap join).
rg -n "dictionaryWordId" apps/api/src/cards/card.entity.ts

# 5. Confirm collection provenance columns are still absent (LC-405 remains).
rg -n "sourcePlatformCollectionId|level|topic" apps/api/src/collections/collection.entity.ts

# 6. Confirm the shipped Explore pattern to mirror (shelves, level chips, See All).
rg -n "platformStories|selectedLevel|LEVEL_FILTERS" apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts

# 7. Confirm WordDictionaryService exposes what adoption needs.
rg -n "async lookup|findByIds|toModel" apps/api/src/word-dictionary/word-dictionary.service.ts apps/api/src/word-dictionary/word-dictionary.repository.ts
#    If no findByIds(ids[]) bulk fetch exists on the repository, add it in LC-403.
```

---

## §1 — Remaining problems

| # | Problem | Evidence |
|---|---|---|
| P1 | Platform collections are **invisible to users** — no read endpoints, no UI | Only `/admin/...` routes exist |
| P2 | Imported collections **can never be published** | `isPublished:false` on import; no toggle endpoint |
| P3 | No path from a curated set to **cards the user owns** (adopt) | No adopt endpoint; `CollectionEntity` has no provenance |
| P4 | v1's browse UX predates everything we now know works | Story Explore shipped shelves+chips users already understand; dictionary enables progress signals v1 couldn't show |
| P5 | The core promise — *create stories from these categories* — is buried | v1 put "Generate story" in a detail footer; platform stories (read now, zero wait) weren't surfaced at all |

---

## §2 — The refined UX (and why it's better)

### 2.1 — Design critique of v1

v1 was correct but flat: a Mine/Browse segment, plain text-chip level filter, topic *section headers* over a vertical list of small rows, and a small trailing "Add" button. Three weaknesses, in hindsight:

1. **No motivation signal.** Cards showed `28 words` — a cost, not an invitation. Nothing told the learner *how close they already are*.
2. **No orientation.** "All levels" default dumped every set on everyone; an A1 beginner saw C1 sets first if sort said so.
3. **Inconsistent with the app the user now has.** Story Studio's Explore shipped horizontal shelves with rich cards and level chips. A second browse surface with a different grammar makes the app feel stitched together.

### 2.2 — The three refinements (research-grounded)

**R1 · Known-words progress on every card — the endowed-progress effect.**
Each Explore card shows a progress ring/bar: **"12 of 28 known."** Research on the goal-gradient and endowed-progress effects is unambiguous: people who *start* with visible non-zero progress are dramatically more likely to commit and complete, and motivation accelerates with proximity to the goal. Because platform words are dictionary refs and cards carry `dictionaryWordId`, this number is exact and cheap (one SQL aggregate). A set the learner is 80% through becomes nearly irresistible to finish; a fresh set honestly shows `0 of 28 · all new`. Adopted sets show live mastery progress instead.

**R2 · Smart level default — "Your level" anchoring.**
The level chip row defaults not to "All" but to the learner's inferred working level (mode of `cefrLevel` across their dictionary-linked cards), labeled with a subtle "for you" affordance. Defaults that meet the user where they are reduce the orientation cost to zero; "All" remains one tap away. New users with empty vaults default to A1.

**R3 · One Explore grammar across the app — topic shelves, level chips, See All.**
Rename "Browse" → **Explore** and adopt the exact shipped Story-Explore pattern: horizontally scrolling **topic shelves** of rich cards (~160px, ≥2.2 visible to invite scrolling), the same level-chip filter component, and a "See all" drill-down per topic. The user already learned this grammar in Stories; the Vault reuses it instead of teaching a second one. Chips remain the filter primitive and segments the source switch, per the original research (unchanged and still correct).

**R4 · Stories first-class, twice.**
The collection detail pairs both halves of "master the words in context": a **related platform-stories shelf** (read one *now*, zero wait — matched by level + category) and the **Generate story** CTA (personal story from these exact words). Adoption itself is reframed from "Add" to its real value: **"Get these words — instant, audio included."**

### 2.3 — Information architecture (refined)

```
Vault → Collections tab (existing rail)
 ├── segment: [ My Sets ]  [ Explore ]          ← source switch (unchanged primitive)
 │
 ├── MY SETS  → user collections; adopted ones badged "From library",
 │              filterable by carried level; live due/mastery signals
 │
 └── EXPLORE  → search (titles + topics)
                level chips: A2• (your level) · All · A1 · B1 · B2 · C1   + counts
                TOPIC SHELVES (horizontal):
                  🍎 Food & Drink  ───────────────  See all ›
                    [card: ring 12/28 · A1 · Get]  [card …]  [card…
                  ✈️ Travel ───────────────────────  See all ›
                    …
                card states: fresh (0 known) → partial (ring) → adopted (mastery bar + Open)
```

Collection detail: progress hero ("You already know 12 of 28 — adopting adds 16 new cards"), words grouped **New here (16)** / **Already yours (12)**, related-stories shelf, sticky dual CTA **Get 16 new words** · **Generate a story**.

---

## §3 — Target architecture (delta only — entities exist)

### 3.1 — Public read model (hydrated from the dictionary)

`platform_collection_words` holds only refs, so the public API hydrates per request:

```
GET /platform-collections                 (auth'd user)
  → { collections: PlatformCollectionSummary[], levelCounts, suggestedLevel }
     summary = { id, title, emoji, level, topic, wordCount,
                 knownCount,            ← |collection.dictWordIds ∩ user.cards.dictWordIds|
                 adoptionStatus, adoptedCollectionId }

GET /platform-collections/:id
  → PlatformCollectionDetail { …summary, words: PlatformCollectionWordView[] }
     wordView = dictionary entry projection + { knownToUser: boolean }
```

`knownCount` in one aggregate (no N+1):

```sql
SELECT pcw."platformCollectionId", COUNT(*)::int AS known
FROM platform_collection_words pcw
JOIN cards c ON c."dictionaryWordId" = pcw."dictionaryWordId" AND c."userId" = $1
GROUP BY pcw."platformCollectionId";
```

`suggestedLevel` = mode of `word_dictionary.cefrLevel` over the user's linked cards (fallback `A1`).

### 3.2 — Adoption: dictionary → cards, zero AI

```
POST /platform-collections/:id/adopt → Collection
  1. idempotent: existing user collection with sourcePlatformCollectionId? → return it
  2. create user CollectionEntity { name, emoji, level, topic, sourcePlatformCollectionId }
  3. fetch the set's dictionary entries (bulk findByIds)
  4. skip entries whose dictionaryWordId already exists on a user card
     (legacy fallback: also skip on normalizeLemma match for unlinked cards)
  5. create CardEntity per remaining entry:
       content ← copied from dictionary (article, translation, examples, notes…)
       dictionaryWordId ← entry.id      (audio + provenance for free)
       srsState ← null (new)            tags ← ['platform:<collectionId>']
```

No enrichment, no TTS, no batching, no spinner — the response is bounded by one insert batch. Story generation then works **unchanged** (real user cards), exactly as v1's ADR-1 intended, now with a cleaner source.

### 3.3 — Publish lifecycle (closing P2)

```
GET   /admin/platform-collections            → all (drafts + published) with wordCount
PATCH /admin/platform-collections/:id/publish   { isPublished: boolean }
```

Admin UI gains a "Collections" list tab with publish toggles next to the existing import tabs.

---

## §4 — Refined story map

Ticket IDs LC-403–412 are retained where scope survives (per our update convention); LC-413 stays docs; LC-414–415 are new.

| Phase | Ticket | Title | Pts | Depends on |
|---|---|---|---|---|
| 0 — Contracts | **LC-403a** | Public domain types: `PlatformCollectionSummary/Detail/WordView`, adopt DTO, list-response meta | 1 | — |
| 1 — Backend | **LC-403** | Public module: list (+`knownCount`, `levelCounts`, `suggestedLevel`) + detail (dictionary-hydrated, `knownToUser`) | 5 | 403a |
| 1 — Backend | **LC-404** | Adopt endpoint — dictionary-backed clone, `dictionaryWordId` dedup (+ lemma fallback), idempotent | 5 | 403 |
| 1 — Backend | **LC-405** | `CollectionEntity` provenance: `sourcePlatformCollectionId`, `level`, `topic` (+ surface in API/model) | 2 | — |
| 1 — Backend | **LC-415** *(new)* | Admin publish lifecycle: list endpoint + publish toggle + admin UI tab | 2 | — |
| 2 — Mobile data | **LC-406** | `PlatformCollectionApiService` + `PlatformCollectionStore` (signalStore: level/search filters, shelves grouping, adopt) | 3 | 403a |
| 3 — Mobile UI | **LC-407** | Collections tab segment **My Sets / Explore** (lazy Explore load; My Sets gains level filter + library badge) | 2 | 406, 405 |
| 3 — Mobile UI | **LC-408** | Explore view: smart-default level chips + **topic shelves** with progress-ring cards + See-all drill-down | 5 | 407 |
| 3 — Mobile UI | **LC-409** | Unified search across both segments (kept from v1) | 3 | 407 |
| 4 — Mobile UI | **LC-410** | Detail page: progress hero, **New here / Already yours** grouping, related-stories shelf, dual sticky CTA | 5 | 408, 414 |
| 4 — Mobile UI | **LC-411** | Adopt flow: instant "Get words" (audio-included toast, deduped count), generate-sheet pre-seed, adopted states | 3 | 410, 404 |
| 5 — Pairing | **LC-414** *(new)* | Collection↔story pairing: nullable `storyCategory` on `platform_collections` (admin-set) + matched-stories fetch | 2 | 415 |
| 6 — Polish | **LC-412** | Filter/segment persistence, skeletons, empty/error states, LDS audit (kept from v1) | 2 | 408–411 |
| 7 — Docs | **LC-413** | `CLAUDE.md`: public endpoints, store ownership, epic status table | 1 | all |

**Total remaining: ~40 points.** Removed from v1: LC-400/401/402 (shipped/superseded by LC-WD).

### Implementation order

```
LC-403a → LC-403 → LC-404 → LC-411
   LC-405 ──┘ (parallel)        ▲
   LC-415 → LC-414 ─────────────┤ (feeds LC-410's stories shelf)
LC-406 → LC-407 → LC-408 → LC-410 → LC-411 → LC-412 → LC-413
              └─► LC-409 (parallel)
```

**LC-415 first or in parallel with everything** — until publish exists, nothing imported is visible and no UI ticket can be verified against real data.

---

## §5 — Ticket details

### LC-403a · Public contracts
**Pts:** 1

```typescript
export interface PlatformCollectionSummary {
  id: string; title: string; emoji: string | null;
  level: CefrLevel; topic: string;               // topic is free text in the shipped schema
  wordCount: number;
  knownCount: number;                             // exact dictionary-link overlap for this user
  adoptionStatus: 'not-adopted' | 'adopted';
  adoptedCollectionId: string | null;
}

export interface PlatformCollectionWordView {
  dictionaryWordId: string;
  displayText: string; article: 'der'|'die'|'das'|null;
  translation: string; wordType: string;
  cefrLevel: CefrLevel | null;
  exampleTarget: string | null; exampleNative: string | null;
  knownToUser: boolean;
}

export interface PlatformCollectionDetail extends PlatformCollectionSummary {
  words: PlatformCollectionWordView[];
  relatedStories: PlatformStoryCard[];            // populated when storyCategory is set (LC-414)
}

export interface PlatformCollectionListResponse {
  collections: PlatformCollectionSummary[];
  levelCounts: Record<CefrLevel, number>;
  suggestedLevel: CefrLevel;
}
```

**AC:** exported from barrel; `tsc --noEmit` green; reuses existing `CefrLevel` and `PlatformStoryCard` types.

---

### LC-403 · Public list + detail endpoints
**Pts:** 5 · **Depends on:** 403a

New `apps/api/src/platform-collections/` module (controller + service) reading the admin-owned entities. List returns published only, with the `knownCount` aggregate (§3.1), `levelCounts`, and `suggestedLevel`. Detail hydrates words from the dictionary via a **bulk** `findByIds` (add to `WordDictionaryRepository` if absent — pre-flight #7) and flags `knownToUser` per word.

**AC**
- [ ] `GET /platform-collections` excludes drafts; one query for collections + one aggregate for knownCounts (no N+1).
- [ ] `knownCount` is exact: a user who owns 12 of a set's dictionary words sees 12.
- [ ] `suggestedLevel` = mode of the user's linked cards' `cefrLevel`; `A1` for empty vaults.
- [ ] Detail words hydrate in `position` order with one bulk dictionary fetch; each carries `knownToUser`.
- [ ] `adoptionStatus`/`adoptedCollectionId` resolved via `collections.sourcePlatformCollectionId` (LC-405).
- [ ] Unknown or unpublished `:id` → 404.

---

### LC-404 · Adopt — the AI-free clone
**Pts:** 5 · **Depends on:** 403

Implements §3.2. Dedup primary key is `card.dictionaryWordId`; fallback `normalizeLemma` for legacy unlinked cards. Cards copy dictionary content (the dictionary epic's copy-not-reference rule) and link `dictionaryWordId`, so audio resolves instantly via the existing card→dictionary→audio path.

**AC**
- [ ] Adopting makes **zero** AI and **zero** TTS calls (assert via provider spies/log).
- [ ] Created cards carry `dictionaryWordId`; audio for each plays without a generation step.
- [ ] Dedup: a user owning "der Apfel" (linked or legacy-unlinked) does not receive a duplicate.
- [ ] Idempotent: second adopt returns the same collection, creates nothing.
- [ ] Response is the user `Collection` with accurate post-dedup `cardCount`.
- [ ] p95 latency < 2s for a 40-word set (no external calls — DB only).

---

### LC-405 · Collection provenance
**Pts:** 2

Nullable `sourcePlatformCollectionId`, `level`, `topic` on `CollectionEntity` + migration; surfaced through `toModel`, the shared `Collection` type, and the mobile model. Hand-authored collections stay all-null.

---

### LC-415 · Admin publish lifecycle *(new — closes P2)*
**Pts:** 2

`GET /admin/platform-collections` (drafts + published) and `PATCH /admin/platform-collections/:id/publish`. Admin UI gains a "Collections" tab listing imports with a publish toggle and word/reuse counts.

**AC**
- [ ] A freshly imported (draft) collection can be flipped live from the admin UI and immediately appears in the public list.
- [ ] Unpublishing removes it from public list/detail (404) without deleting data.
- [ ] Both routes behind `JwtAuthGuard + AdminGuard`.

---

### LC-406 · Mobile data layer
**Pts:** 3 · **Depends on:** 403a

`PlatformCollectionApiService` (typed observables) + `PlatformCollectionStore` (`signalStore`). State: `collections`, `levelCounts`, `suggestedLevel`, `selectedLevel: CefrLevel|'all'`, `search`, `isLoading`, `hasEverLoaded`. Computed: `visible` (level∧search), `shelves` (group `visible` by topic, ordered by per-topic match count), `progressFor(c) = knownCount/wordCount`. Methods: `loadCollections` (rxMethod), `setLevel`, `setSearch`, `adopt(id)` — optimistic `adoptionStatus` patch + `CollectionStore.loadCollections()` refresh. On first load, `selectedLevel` initializes to `suggestedLevel`.

---

### LC-407 · My Sets / Explore segment
**Pts:** 2 · **Depends on:** 406, 405

Segment under the Collections tab (source switch — correct primitive, unchanged). Default **My Sets**; first switch to **Explore** lazily loads the store. My Sets: adopted collections show a "From library" badge and join a lightweight level filter using the carried `level`.

**AC:** segment renders with LDS tokens; per-segment state retained while on the tab; words/collections rail untouched; My Sets badge + level filter live.

---

### LC-408 · Explore — shelves with progress
**Pts:** 5 · **Depends on:** 407

The headline UI ticket.

- **Level chips:** reuse the `n-toolbar` chip pattern; counts from `levelCounts`; the suggested level renders first with a "for you" dot and is **pre-selected**; "All" adjacent.
- **Topic shelves:** for each topic in `shelves`, a header (`🍎 Food & Drink · See all ›`) over a horizontal scroll row of cards (~160px, ≥2.2 visible at 375px).
- **Card anatomy:** emoji tile → title (2-line clamp) → level pill → progress state:
  - *fresh*: `28 words · all new` + **Get** button
  - *partial*: ring/bar `12/28 known` + **Get 16 new**
  - *adopted*: mastery bar from the user collection + **Open**
- **See all:** drill-down page, vertical grid, same cards, scoped to topic (+ active level).

**AC**
- [ ] Level chip filtering is instant/client-side; active chip styling matches the Vault toolbar convention.
- [ ] Suggested level pre-selected on first visit with visible "for you" affordance; user override persists (LC-412).
- [ ] Progress ring values are exact (`knownCount/wordCount`); fresh sets honestly show 0.
- [ ] Shelves scroll horizontally with ≥2.2 cards visible; See-all shows the full topic grid.
- [ ] Adopted cards visually distinct and deep-link to the user collection.
- [ ] Empty level → `<lc-empty-state>`; skeleton shelves while loading.

---

### LC-410 · Detail — progress hero, grouping, stories
**Pts:** 5 · **Depends on:** 408, 414

Route `/vault/collections/platform/:id`.
- **Hero:** emoji, title, level pill, topic; progress ring + "You already know **12 of 28** — adopting adds **16** new cards" (or "28 new words for you" when fresh).
- **Words:** grouped **New here (16)** first, then **Already yours (12)** (collapsed by default); rows show `<lc-article-badge>`, German, English, 🔊 (audio exists already — dictionary-linked), expandable example.
- **Related stories shelf:** `relatedStories` as story cards → platform-story reader. Hidden when empty.
- **Sticky footer:** **Get 16 new words** (primary) + **Generate a story** (secondary). Adopted state: **Open in My Sets** + **Generate a story**.

**AC:** grouping counts exact; audio plays per word with no generation wait; stories shelf navigates to the existing reader; back returns to Explore with filter+scroll preserved.

---

### LC-411 · Adopt flow + story wiring
**Pts:** 3 · **Depends on:** 410, 404

- **Get words** → `store.adopt(id)` → success toast **"16 words added — audio included ✓"** (post-dedup count) → card/detail flip to adopted; collection appears in My Sets badged.
- **Generate a story** → adopt-if-needed (await, it's fast) → open the existing Generate sheet **pre-seeded** with the adopted collection; generation pipeline untouched.
- Re-adopt → "Already in your sets" + deep link.

---

### LC-414 · Collection ↔ story pairing *(new)*
**Pts:** 2 · **Depends on:** 415

Nullable `storyCategory: StoryCategory` on `platform_collections` (+ admin UI select on import/list). LC-403's detail populates `relatedStories` via the existing `PlatformStoriesService.findAll({ level, category, limit: 6 })` when set; empty array otherwise. Deterministic matching — no fuzzy topic-string mapping.

---

### LC-412 · Polish *(kept)* — persist segment/level/scroll, skeleton shelves, the three empty states, LDS token audit.
### LC-409 · Unified search *(kept from v1, unchanged scope)* — one field, per-segment terms, composes with level chips.
### LC-413 · Docs — `CLAUDE.md` endpoints, store table, epic status row.

---

## §6 — ADRs (refined)

### ADR-1 *(revised)* — Adopt = clone **from the dictionary**, not from denormalized platform words
v1 cloned from word copies stored on the platform collection. The shipped schema is reference-based, which is strictly better: **one** source of truth for word data (a dictionary fix improves every consumer), adoption needs **no AI and no TTS** (everything pre-exists), and the card's `dictionaryWordId` makes audio and provenance free. Story generation remains untouched — adopted words are ordinary user cards. v1's core insight (preserve the single-card model) stands; the source upgraded.

### ADR-2 *(new)* — `knownCount` computed server-side per request
Alternatives: client-side intersection (ships every set's full id list to the phone) or a materialized per-user table (staleness + write amplification). One SQL aggregate at list time is exact, cheap at our scale, and always fresh. Revisit only if the published catalog grows by orders of magnitude.

### ADR-3 *(new)* — Progress-forward cards (endowed progress), honestly
"12 of 28 known" leverages the endowed-progress/goal-gradient effects — visible non-zero starting progress measurably increases commitment and completion. Constraint: **never fake it.** The number is an exact join; fresh sets show `all new`. Inflated progress erodes trust and is explicitly warned against in the literature.

### ADR-4 *(new)* — One Explore grammar; "Explore", not "Browse"
Story Studio shipped shelves + level chips + See-all; users learned it. The Vault reuses the identical pattern and the identical name. Two browse surfaces with one grammar < two grammars. v1's primitives (segment=source, chips=filter) remain correct; only the list body upgrades from flat sections to shelves.

### ADR-5 *(new)* — Deterministic story pairing via admin-set `storyCategory`
Collection `topic` is free text (shipped schema); story `category` is an enum. Fuzzy text→enum mapping would mis-pair silently. A nullable admin-set category is one select at import time and makes pairing exact; unset simply hides the shelf.

### ADR-6 *(revised)* — Smart level default
v1 defaulted to "All". With per-word `cefrLevel` now in the dictionary, defaulting to the learner's inferred level (override one tap away, persisted) removes the orientation tax for the common case.

### ADR-7 *(carried)* — Numbering: retain LC-403–413 for surviving scope; LC-414/415 extend the block. Shipped v1 tickets are marked superseded rather than renumbered, matching the Vault-redesign update convention.

---

## §7 — Non-goals (unchanged from v1 unless noted)

Community decks; editing platform templates from the client; template→adopted re-sync (provenance enables it later); paywalled levels/topics; C2; server-side full-text search; **(new)** audio *pre-download* on adopt — audio exists in the registry and resolves on first play via the standard card path; **(new)** writing `storyCategory` retroactively for already-imported collections beyond a simple admin edit.
