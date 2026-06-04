# Epic — Review System Reconciliation & Shared Derived State

**Epic ID:** LC-RV (Review Veracity)
**Status:** 📋 Ready for implementation
**Owner skill:** Follow `.claude/skills/angular.md` **strictly**, plus the rules in `CLAUDE.md` and `apps/mobile/architecture-redesign-plan.md`.
**Tests:** Skip all `*.spec.ts` (per `CLAUDE.md` → "Tests — skip for now"). Where this epic says "verify", do it by reading code and reasoning, not by writing specs.

---

## 0. How to start (read this first)

Before changing anything, **re-research the codebase from scratch** — it changes between sessions and the file references below may have drifted.

1. Read `CLAUDE.md`, `.claude/skills/angular.md`, and `apps/mobile/architecture-redesign-plan.md` in full.
2. Map the review system end-to-end and confirm (or correct) every finding in §2 against the live code. Treat §2 as a hypothesis to verify, not gospel.
3. Only then begin Phase 1.

Do **not** silently "fix" anything listed in the `CLAUDE.md` Tech-Debt register that is out of scope for this epic.

---

## 0.1 Pre-flight verification checklist (run before touching code)

Work through this top to bottom. The goal is to **confirm or refute every §2 finding against the live code** and capture the current numbers, so you can prove afterwards that they reconciled. Record the result of each item; if a finding no longer holds, update §2 and adjust the affected ticket before starting it. Paths/line numbers will have moved — search by symbol, not by line.

Adjust the search root to the repo layout. Commands assume ripgrep (`rg`); fall back to `grep -rn` if unavailable.

### Step 1 — Locate the moving parts (confirm files still exist)

```bash
# Stores, services, selectors
rg -l "signalStore|SrsState|srsState" apps/mobile/src/app | sort
rg -n "class Sm2Service|compute\(|freshState" apps/mobile/src/app/shared/srs
rg -n "computeSm2|freshSrsState|batchRateSrs" apps/api/src/cards
rg -n "computeSM2|repetitionsToMastery" libs/shared
```
- [ ] `ReviewStore`, `CardStore`, `CollectionStore`, `ReviewFilterService`, `SessionStatsService`, `Sm2Service`, `LocalDataService`, `SrsSyncHandler`, home/review-hub/collection-detail pages all located.

### Step 2 — Finding A: is "new" defined by `masteryLevel`?

```bash
rg -n "masteryLevel \?\? 0\) === 0|masteryLevel === 0|isNew|never reviewed|lastReviewedAt" apps/mobile/src/app
rg -n "Math.floor\(repetitions ?/ ?2\)|floor\(repetitions" apps/mobile/src/app apps/api/src
```
- [ ] Confirm `newCount` / `getNewCount` / `home#newCardsCount` use `masteryLevel === 0`.
- [ ] Confirm `masteryLevel = floor(repetitions / 2)` (so one successful rep ⇒ level 0).
- [ ] **Hand-trace** one fresh card rated `Good (3)` once: assert `repetitions=1`, `masteryLevel=0`, and that it is therefore still counted as "new". Write down the result.

### Step 3 — Finding B: enumerate every due/new/mastered definition

```bash
rg -n "dueCards|getDueTodayCount|dueCount|totalDue|dueToday" apps/mobile/src/app apps/api/src
rg -n "masteredCount|=== 'mastered'|>= 5|=== 5" apps/mobile/src/app apps/api/src
rg -n "nextDueAt" apps/mobile/src/app apps/api/src
```
- [ ] Rebuild the §2.2-B matrix from the live code (which definitions include never-studied cards, which exclude them).
- [ ] Note every place "mastered" is `=== 5`, `>= 5`, or `state === 'mastered'`.

### Step 4 — Finding C: count SM-2 implementations

```bash
rg -n "rating < 3|easeFactor|intervalDays|repetitions \+= 1|repetitions = 0" \
  apps/mobile/src/app/shared/srs apps/api/src/cards libs/shared
```
- [ ] Confirm there are **three** SM-2 bodies (`Sm2Service.compute`, API `computeSm2`, `libs/shared/utils#computeSM2`).
- [ ] Diff the mobile `Sm2Service` vs API `computeSm2` — record whether they are currently identical.
- [ ] Diff either against `libs/shared/utils#computeSM2` — confirm the mastery mapping / fail-interval / rep-increment order differ.
- [ ] Grep for callers of the orphan: `rg -n "computeSM2\(" apps libs` — record who (if anyone) uses it.

### Step 5 — Finding D: UTC vs local day bucketing

```bash
rg -n "toISOString\(\)\.split\('T'\)\[0\]|getDay\(\)|86_?400_?000|startOf" apps/mobile/src/app
```
- [ ] Confirm streak, `last7DaysActivity`, `weeklyData`, and both `completedToday` implementations bucket by `toISOString()` (UTC) while "today"/week come from local `Date`/`getDay()`.
- [ ] Confirm `SessionDatePipe` renders **local** time (so history labels can disagree with the chart).

### Step 6 — Finding E: how many ways is "reviewed" counted?

```bash
rg -n "ratings\)\.length|sessionCardIds|cardsReviewed|reduce\(\(sum" apps/mobile/src/app
```
- [ ] Confirm Session History "Cards" = `ratings.length` (per session) but weekly/today use distinct `sessionCardIds` (deduped).

### Step 7 — Finding F: session persistence & startup load

```bash
rg -n "loadHistory|session_history|reviewSessions|setSessionHistory" apps/mobile/src/app apps/api/src
```
- [ ] Confirm session history is written only to IndexedDB (`session_history:{userId}`) and **not** POSTed to the backend.
- [ ] **Critical:** grep for who calls `loadHistory()`. If nothing invokes it at app/feature startup, session-derived stats are empty on cold launch — record this, it changes LC-RV11 priority.

### Step 8 — Finding G: type drift

```bash
rg -n "SyncOperationType|FLUSH_SRS_RATINGS|CREATE_COLLECTION|'CREATE_CARD'" apps/mobile/src/app libs/shared
rg -n "interface ReviewSession|LocalReviewSession|update\(id: string, patch: Partial<Card>" apps/mobile libs apps/api
```
- [ ] Confirm `SyncOperation['type']` (domain) omits types that are enqueued in code.
- [ ] Confirm `LocalReviewSession` vs domain `ReviewSession` shape mismatch.
- [ ] Confirm `CardApiService.update` uses `Partial<Card>`.

### Step 9 — Capture the baseline numbers (so you can prove reconciliation later)

With the dev stack running (`npm run start-db`, `npm start`) on the seed account, record the **current** values:
- [ ] Home banner: DUE / new / reviews.
- [ ] Home "This week": each bar's day + the total.
- [ ] Review-hub: due / new / overdue / completed-today.
- [ ] A sample collection: due / mastered on the list **and** in collection detail (note any mismatch).
- [ ] Session History: number of sessions and each row's Cards/Struggled/Nailed.
- [ ] `tsc --noEmit` baseline for `apps/api` and `apps/mobile` (record it's green *before* you start).

### Step 10 — Gate

- [ ] §2 confirmed or corrected; tickets adjusted for any drift.
- [ ] Baseline numbers captured.
- [ ] Placement decision for the stats facade (§3.3) made and noted.
Only when all three are checked: begin **LC-RV01**.

---

## 1. Why this epic exists

The review system produces numbers that disagree with each other across screens. Concrete user-visible symptoms on a single account:

- **Home hero banner** shows `637 DUE`, `637 new cards`, `0 reviews` — three numbers that are redundant and look wrong, while the vault holds `665` words and the user has clearly completed multiple sessions.
- **Home "This week"** bar chart shows activity on Mon/Wed/Thu and a legend of `46 cards reviewed`.
- **Session History** ("All sessions") lists ~8 sessions across *today*, *yesterday*, and *3 days ago* — which cannot be cleanly reconciled with either the `46` figure or the bars.

These are not cosmetic. They are symptoms of **the same quantity ("due", "new", "mastered", "reviewed today/this week", "streak") being re-derived independently by every consumer**, on top of **a card-lifecycle model that mislabels reviewed cards as "new"**, **multiple divergent SM-2 implementations**, and **UTC-vs-local day bucketing bugs**.

The goal of this epic is to make the review system **correct and internally consistent** by introducing **shared selectors and a shared stats facade** so every consumer reads the *same* derived state instead of computing its own.

---

## 2. System analysis (verify against live code)

### 2.1 End-to-end flow as it exists today

1. **Rate a card** → `ReviewStore.rateCard(card, rating)` (`features/review/store/review.store.ts`):
   - Optimistically computes new SRS via `Sm2Service.compute()` and writes it to `CardStore.updateCard()`.
   - Buffers a `PendingSrsRating` to IndexedDB (`LocalDataService.setPendingSrsRatings`), serialised through a `bufferChain` promise.
   - If online, flushes that single rating via `CardApiService.batchRateSrs([rating])` → `POST /cards/srs/batch`.
2. **Complete session** → `ReviewStore.completeSession()` appends a `LocalReviewSession` to `sessionHistory`, persists a slimmed copy (`reviewedCardIds`, not full cards) to `session_history:{userId}` in IndexedDB, then flushes remaining pending ratings (or enqueues `FLUSH_SRS_RATINGS`).
3. **Server recompute** → `apps/api/src/cards/cards.service.ts#batchRateSrs` re-runs **its own** SM-2 (`computeSm2`) over the buffered ratings and saves card `srsState`.
4. **Offline catch-up** → `SrsSyncHandler` (`features/review/services/srs-sync.handler.ts`) dedups pending ratings (latest per card), batch-posts, clears buffer, calls `CardStore.loadCards()`.
5. **Consumers** (home, review-hub, vault, collection-detail) each read `CardStore.cards()` / `ReviewStore.sessionHistory()` and **derive their own counts**.

### 2.2 Root causes

> Each finding lists the file(s) to confirm. Line numbers will have moved — search by symbol.

**A. `masteryLevel === 0` is treated as "never reviewed", but the SM-2 formula collapses reviewed cards back to level 0.**
In `shared/srs/sm2.service.ts` and `apps/api/src/cards/cards.service.ts`:
`masteryLevel = Math.min(5, Math.floor(repetitions / 2))`.
- A card reviewed **once** successfully → `repetitions = 1` → `masteryLevel = 0` → counted as **new**.
- A card **failed** (`rating < 3`) → `repetitions` resets to `0` → `masteryLevel = 0` → counted as **new**.
Every consumer that defines "new" as `masteryLevel === 0` (`CardStore.newCount`, `home.newCardsCount`, `ReviewFilterService.getNewCount`) therefore **over-counts new cards** and is the direct cause of `637 new / 0 reviews` after real sessions. The honest "never studied" signal on the model is `srsState == null` **or** `srsState.lastReviewedAt === null` (equivalently `lastRating === null` / `state === 'new'`) — *not* `masteryLevel`.

**B. "Due", "new", "mastered" each have multiple contradictory definitions.** Confirm this matrix:

| Quantity | Location | Definition |
|---|---|---|
| due | `CardStore.dueCards` | `masteryLevel > 0 && nextDueAt <= now` (excludes new) |
| due | `ReviewFilterService.getDueTodayCount` | `masteryLevel > 0 && nextDueAt <= now` (excludes new) |
| due | `collection-detail.page.ts#dueCount` | `srsState && nextDueAt <= now` (**includes** new) |
| due | API `collections.service#buildCountsMap` | `srsState IS NOT NULL && nextDueAt <= now` (**includes** new) → feeds `Collection.dueCount`, `CollectionStore.totalDue` |
| due | `home.page.ts#totalDue` | `dueCards (mastery>0 & due) + newCardsCount (mastery 0)` |
| due | `review-hub.page.ts#dueTodayCount` | `overdueCount (mastery>0 & due) + newCount (mastery 0)` |
| mastered | `CardStore.masteredCount` | `masteryLevel === 5` |
| mastered | `collection-detail.page.ts#masteredCount` | `masteryLevel >= 5` |
| mastered | API `buildCountsMap` | `state === 'mastered'` (set when `masteryLevel >= 4`) |

Result: the same collection shows different `due`/`mastered` numbers on the collections list (server-computed) vs collection detail (client-recomputed) vs home banner.

**C. Three divergent SM-2 implementations.** `CLAUDE.md` states SM-2 lives **only** in `shared/srs/sm2.service.ts`. In reality:
1. `shared/srs/sm2.service.ts#Sm2Service.compute` — used by the optimistic client path.
2. `apps/api/src/cards/cards.service.ts#computeSm2` — server authoritative path. **Currently identical to #1 but hand-duplicated** → will drift.
3. `libs/shared/utils/src/index.ts#computeSM2` — **a different algorithm**: different fail-interval, different order of `repetitions += 1`, different ease-factor handling, and a completely different `repetitionsToMastery()` mastery mapping. Any caller of this gets different results.

Because the client computes SM-2 *and* the server recomputes it on flush (then `loadCards()` overwrites the client), any divergence makes a card's interval/mastery visibly jump after sync.

**D. UTC-vs-local day bucketing bug (affects streak, weekly chart, "today" counts).**
`home.page.ts` (`dayStreak`, `last7DaysActivity`, `weeklyData`), `review-hub.page.ts#completedToday`, and `home#completedToday` all bucket sessions by `new Date(iso).toISOString().split('T')[0]` (a **UTC** calendar day) while deriving "today"/week boundaries from local `new Date()` / `getDay()`. For any non-UTC user (the test account is in DE, UTC+1/+2), a session completed late in the evening (e.g. the `Yesterday, 23:41` row) rolls into the **next UTC day** and lands on the wrong bar / wrong streak day / wrong "completed today". `SessionDatePipe` renders **local** time in Session History, so history and the chart disagree about which day a session belongs to.

**E. "Cards reviewed" is measured three different ways.**
- Session History "Cards" = `SessionStatsService.computeStats` → `ratings.length` (cards rated in that one session).
- Weekly chart total = **distinct card IDs** across all sessions of a day (`home#weeklyData` dedups via `sessionCardIds`).
- `home#completedToday` / `review-hub#completedToday` = distinct card IDs today.
So "46 cards reviewed" (weekly distinct) can never equal the sum of the per-session "Cards" rows (which double-count a card reviewed in two sessions, e.g. a "Struggled cards retry"). Nothing in the UI explains the difference.

**F. Session history is local-only and never reconciled with the server.**
`session_history:{userId}` lives solely in Ionic Storage / IndexedDB. There is a backend `reviewSessions` resource (see `CLAUDE.md` API table) and a domain `ReviewSession` type, but the mobile app **never POSTs sessions**. Only SRS *ratings* sync. Consequences: streak, weekly chart, and history are device-local, lost on reinstall, and not shared across devices. The designed `ProgressStats` / `DayActivity` domain model is unused. Also **verify whether `ReviewStore.loadHistory()` is actually invoked at app/feature startup** — if it is not, session-derived stats start empty on a cold launch and only populate after a session completes in-process, which would itself produce inconsistent numbers.

**G. Type drift.**
- Domain `SyncOperation['type']` union (`libs/shared/domain/src/index.ts`) omits `FLUSH_SRS_RATINGS` and `CREATE_COLLECTION`, both of which are enqueued in code via a local `SyncOperationType`.
- `LocalReviewSession` (mobile, `reviewedCards: Card[]`) and domain `ReviewSession` (`reviewedCards: number`) share a confusingly similar name with different shapes.
- `CardApiService.update` uses `Partial<Card>`, violating `CLAUDE.md` rule 10 (use DTOs for writes).

**H. Architecture-boundary smells.**
- `home.page.ts` injects `ReviewStore`, but `CLAUDE.md` store-ownership lists `ReviewStore` as **review-only**. Home needs session-derived stats → argues for a shared stats facade rather than reaching into a feature store.
- `home#newCardsCount` and `home#totalDue` re-implement logic that already exists in `CardStore` / `ReviewFilterService` instead of reusing it.

---

## 3. Target architecture

**Principle:** every "what is due / new / mastered / struggling / reviewed-today / weekly / streak" answer comes from **one** place. Consumers bind to shared computed signals; they never re-derive.

### 3.1 Single card-lifecycle source of truth
Create pure, framework-free selectors in `shared/srs/` (e.g. `srs-status.ts`), exported and used everywhere:

```ts
export function isNew(card: Card): boolean;        // never studied: srsState == null || lastReviewedAt == null
export function isDue(card: Card, now: Date): boolean;     // studied AND nextDueAt <= now
export function isMastered(card: Card): boolean;   // ONE rule — pick masteryLevel===5 OR state==='mastered', not both
export function isStruggling(card: Card): boolean; // studied, low mastery, repetitions-based
export function lifecycleState(card: Card): 'new' | 'learning' | 'review' | 'mastered';
```

Decide and document the canonical meaning of each. "New" must be based on *never studied*, not `masteryLevel`. Align the SM-2 `state` string and `masteryLevel` thresholds so they cannot disagree about "mastered".

### 3.2 Single SM-2 implementation
- Extract the SM-2 function into a shared location both runtimes import (mobile `Sm2Service` wraps it; NestJS `cards.service` imports it). Delete `libs/shared/utils/#computeSM2` (or make it re-export the canonical one). **There must be exactly one SM-2.**
- Client optimistic result and server recompute must be byte-for-byte identical by construction (shared code), so post-sync `loadCards()` never changes a card the user just rated.

### 3.3 Shared stats facade (the core deliverable the team asked for)
Introduce a shared, injectable facade (a `signalStore`, per `CLAUDE.md` state rules) that exposes canonical computed signals consumed by home, review-hub, vault, collection-detail:

- Card-derived (from `CardStore` + §3.1 selectors): `dueCount`, `newCount`, `reviewCount` (= due studied cards, i.e. `dueCount` excluding new), `masteredCount`, `dueByMastery`, `strugglingCount`, optionally per-collection variants.
- Session-derived: `completedToday`, `weekly` (7 local-day buckets + total), `dayStreak`, `last7Days`.

**Placement decision (you choose, justify against `architecture-redesign-plan.md`):**
- Card-derived counts should live in / next to `CardStore` (already shared with home/review/vault) so there is one definition.
- Session-derived stats currently depend on `ReviewStore.sessionHistory()`, which is "review-only". Resolve the boundary by **either** (a) lifting session history into a shared/core store, **or** (b) creating a shared `ReviewStatsStore` that owns the session-derived computed signals and is allowed cross-feature. Update the `CLAUDE.md` store-ownership table to match whatever you pick.

Home must stop re-implementing `newCardsCount`/`totalDue` and bind to the facade.

### 3.4 Local-day bucketing utility
Add shared date helpers (extend `libs/shared/utils`): `localDayKey(d)`, `startOfLocalWeek(d)`, `isSameLocalDay(a,b)`. Replace **every** `toISOString().split('T')[0]` used for streak/weekly/today bucketing with local-time keys. Bucket sessions, streak days, "completed today", and Word-of-the-Day index consistently in local time.

### 3.5 One "reviewed" metric
Pick a single definition of "cards reviewed" (recommended: **distinct cards rated, bucketed by local day**) and show the **same** number on home weekly total and any "today" counter. Session History may keep a per-session "Cards" stat, but label it unambiguously (e.g. it is per-session, retries count again) so it is not mistaken for the deduped total.

### 3.6 Persistence & sync reconciliation
- Ensure session-derived stats derive from a single, consistently-loaded source. Confirm/repair `loadHistory()` startup invocation.
- Either wire mobile session persistence to the backend `reviewSessions` resource (POST on complete, load on startup) so streak/weekly survive reinstall and sync across devices, **or** explicitly scope that out and document session history as device-local — but do not leave it ambiguous.

### 3.7 Type hygiene
Fix the §2.2-G drift: extend `SyncOperation['type']`, reconcile `LocalReviewSession` vs `ReviewSession`, switch `CardApiService.update` to a DTO.

---

## 4. Phased ticket plan

> Points are rough (Fibonacci). Each ticket: do the change, keep `tsc --noEmit` green across `apps/api` and `apps/mobile`, no `*.spec.ts`.

### Phase 1 — Foundations (no UI change yet)

**LC-RV01 · Canonical SRS lifecycle selectors** — *5 pts*
As a developer, I want one definition of new/due/mastered/struggling, so every screen agrees.
- Files: new `apps/mobile/src/app/shared/srs/srs-status.ts` (or shared lib if both runtimes need it); update `CLAUDE.md` SRS section.
- AC:
  - [ ] `isNew` is based on *never studied* (`srsState == null || lastReviewedAt == null`), not `masteryLevel`.
  - [ ] `isMastered`, `isDue`, `isStruggling`, `lifecycleState` defined once, documented.
  - [ ] SM-2 `state` string and `masteryLevel` thresholds reconciled so "mastered" means the same thing both ways.
  - [ ] No behavioural consumer changes yet; pure functions only.

**LC-RV02 · Single SM-2 implementation** — *5 pts*
- Files: `shared/srs/sm2.service.ts`, `apps/api/src/cards/cards.service.ts`, `libs/shared/utils/src/index.ts`, shared lib barrel.
- AC:
  - [ ] Exactly one SM-2 function exists; mobile and API both import it.
  - [ ] `libs/shared/utils#computeSM2` is deleted or re-exports the canonical one (no second algorithm remains).
  - [ ] Optimistic client result == server recompute for the same input (verify by reading both call sites).
  - [ ] `freshState`/`freshSrsState` come from one definition too.

**LC-RV03 · Local-time day/week utilities** — *3 pts*
- Files: `libs/shared/utils/src/index.ts`.
- AC:
  - [ ] `localDayKey`, `startOfLocalWeek`, `isSameLocalDay` added and exported.
  - [ ] No other module computes day keys via `toISOString().split('T')[0]` after Phase 2/3 land.

**LC-RV04 · Type-drift cleanup** — *2 pts*
- Files: `libs/shared/domain/src/index.ts`, `core/services/sync.service.ts`, `features/vault/services/card-api.service.ts`, `features/review/models/review.model.ts`.
- AC:
  - [ ] `SyncOperation['type']` includes `FLUSH_SRS_RATINGS` and `CREATE_COLLECTION` (and any other enqueued types).
  - [ ] `LocalReviewSession` vs domain `ReviewSession` either reconciled or clearly renamed/commented.
  - [ ] `CardApiService.update` takes a DTO, not `Partial<Card>`.

### Phase 2 — Shared stats facade

**LC-RV05 · Canonical card-derived counts in CardStore** — *5 pts*
- Refactor `CardStore.dueCards/newCount/masteredCount/learningCount` to use §3.1 selectors. Add `reviewCount`, `dueByMastery`, `strugglingCount`.
- AC:
  - [ ] All card counts route through `srs-status.ts`.
  - [ ] `newCount` no longer counts reviewed-but-low-mastery cards.
  - [ ] `ReviewFilterService` reuses the same selectors (no private re-definition).

**LC-RV06 · Shared review-stats facade for session-derived metrics** — *8 pts*
- Create the facade per §3.3 (placement justified against `architecture-redesign-plan.md`); expose `completedToday`, `weekly`, `dayStreak`, `last7Days` using local-day utilities. Resolve the `ReviewStore`-is-review-only boundary and update the `CLAUDE.md` ownership table.
- AC:
  - [ ] One definition each of `completedToday`, weekly buckets, streak — all local-time.
  - [ ] Home no longer injects a review-only store directly in violation of the ownership rule (or the rule is updated and documented).
  - [ ] "Cards reviewed" uses the single chosen metric (§3.5).

### Phase 3 — Rewire consumers (UI numbers become consistent)

**LC-RV07 · Home banner reads the facade** — *5 pts*
- `home.page.ts`: `totalDue`, `newCardsCount`, `reviewsCount`, `completedToday`, `ringProgress`, `dayStreak`, `last7DaysActivity`, `weeklyData`, `weeklyTotal` all bind to LC-RV05/RV06.
- AC:
  - [ ] Banner shows `new` (never-studied) and `reviews` (studied & due) that **sum** to the ring total and are not equal-by-accident.
  - [ ] Weekly total equals the chosen metric and matches any "today" counter.
  - [ ] Streak and weekly bars bucket by local day; the `23:41` case lands on the correct day.
  - [ ] No bespoke count logic left in `home.page.ts`.

**LC-RV08 · Review-hub reads the facade** — *3 pts*
- AC:
  - [ ] `overdueCount`/`newCount`/`dueTodayCount`/`completedToday`/donut/breakdown all come from the facade; identical to home for the same data.

**LC-RV09 · Vault + collection counts reconciled (client & server)** — *5 pts*
- `collection-detail.page.ts` and API `collections.service#buildCountsMap` use the **same** due/mastered rules as the selectors.
- AC:
  - [ ] A collection's `due`/`mastered` is identical on the collections list, in collection detail, and on home.
  - [ ] Server SQL `dueCount`/`masteredCount` matches §3.1 semantics (decide whether "due" includes never-studied cards, then apply that rule in **both** places).

**LC-RV10 · Session History clarity** — *2 pts*
- AC:
  - [ ] Per-session "Cards" stat is correct and clearly per-session (retries counted separately) so it is not confused with the deduped weekly total.
  - [ ] Date labels (local) and the chart agree on which day each session belongs to.

### Phase 4 — Persistence reconciliation

**LC-RV11 · Session-history load + (optional) server sync** — *5 pts*
- AC:
  - [ ] `loadHistory()` is invoked at the right lifecycle point; session-derived stats are populated on cold launch.
  - [ ] Either sessions POST/GET against `reviewSessions` (streak/weekly survive reinstall, sync across devices) **or** local-only is explicitly documented in `CLAUDE.md`.
  - [ ] If synced: server is the source of truth for streak/weekly; client cache is a fallback.

---

## 5. Definition of done (epic-level)

- [ ] For one account, **home banner, review-hub, vault/collection cards, and session history all report mutually consistent numbers** for due, new, reviews, mastered, reviewed-today, weekly total, and streak.
- [ ] "New" never includes a card that has been studied at least once.
- [ ] Exactly one SM-2 implementation; client and server cannot diverge.
- [ ] Exactly one definition each of due / new / mastered / struggling / reviewed, consumed via shared selectors + facade; **no consumer re-derives these locally**.
- [ ] All day/week/streak bucketing is local-time; the late-evening session lands on the correct day everywhere.
- [ ] `tsc --noEmit` green for `apps/api` and `apps/mobile`; no `*.spec.ts` added.
- [ ] `CLAUDE.md` (SRS section, store-ownership table, tech-debt register) updated to reflect the new shared architecture.
- [ ] Each ticket followed `.claude/skills/angular.md` (OnPush, standalone, `input()`/`inject()`, `signalStore`, lazy-loaded, no `any`, DTOs for writes, no hardcoded URLs/languages).

---

## 6. Notes & guardrails for the implementer

- Verify §2 before trusting it; line numbers and a few details will have shifted.
- Make data-model semantic changes (LC-RV01) **before** rewiring UI, so each phase is independently green.
- Changing the meaning of `masteryLevel === 0`/"new" will move large numbers (the `637`). That is expected and correct — confirm against `db.json` seed data that the new counts are explainable.
- Respect the offline-first contract: writes go local first, then server; the optimistic path must keep working.
- Do not touch unrelated tech-debt entries (`ListenStore`, `mock-data.ts`, article/mastery global CSS, etc.) unless a ticket requires it.
- Keep PRs ticket-sized and reviewable; do not bundle phases.
