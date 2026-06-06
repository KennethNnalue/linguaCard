# Epic: FSRS Algorithm Migration

**Replaces SM-2 (1987) with FSRS-5 (2022) for accurate spaced repetition**

| Field | Value |
|---|---|
| Epic ID | LC-140 → LC-151 |
| Total points | 21 |
| Depends on | Nothing (self-contained shared-layer change) |
| Blocks | — |
| Files touched | `libs/shared/domain`, `libs/shared/utils`, `apps/api/src/cards/`, `apps/mobile/src/app/shared/srs/`, `apps/mobile/src/app/features/review/` |

---

## Problem statement

LinguaCard currently uses SM-2, a 1987 algorithm. Three concrete bugs observed in production:

1. **Unbounded intervals** — consistent 5-star ratings grow the interval to 20,000+ days (55 years). Words disappear from the deck permanently.
2. **Mastery is a lie** — `masteryLevel = floor(repetitions / 2)`. Level 5 means "tapped a button 10 times", not "demonstrated long-term retention".
3. **6-button scale is too noisy** — users cannot reliably distinguish Blank / Hard / Hmm / Good / Easy / Nailed. Inconsistent ratings corrupt the ease factor, leading to ease hell.

**FSRS** (Free Spaced Repetition Scheduler, Jarrett Ye 2022) solves all three. It models three per-card memory variables (Difficulty, Stability, Retrievability), schedules reviews when recall probability drops to a target threshold (90%), and uses a 4-button scale. On 700M Anki reviews it reduces daily review load by ~25% for identical retention.

---

## Architecture Decision Records

### ADR-1: Use `ts-fsrs` (the official TypeScript port)

**Decision:** Import `ts-fsrs` from npm rather than implementing FSRS from scratch.

**Rationale:** `ts-fsrs` is maintained by the open-spaced-repetition community (the same group that authored the algorithm). It tracks the canonical FSRS-5 spec, is actively updated, and exposes a clean `scheduler.repeat(card, now)` API that returns all four rating outcomes at once — exactly what we need for interval previews. Implementing FSRS from scratch would require maintaining 17+ weight parameters and the full DSR differential equations.

**Consequences:** A new `ts-fsrs` dependency enters the monorepo. It is pure TypeScript with no platform dependencies — usable in both NestJS and Angular without polyfills.

### ADR-2: Keep `SRSStateData` as the shared state type; add FSRS fields

**Decision:** Extend `SRSStateData` with `stability`, `difficulty`, `retrievability` rather than replacing it with a native `ts-fsrs` `Card` type.

**Rationale:** `SRSStateData` is referenced in 12+ files across mobile and API. Swapping the type would require a larger refactor than this epic covers. FSRS fields map cleanly onto the existing shape; `easeFactor` and `repetitions` become legacy fields (kept for the migration period, then dropped in a cleanup ticket).

**Consequences:** A thin adapter layer (`FsrsService`) converts between `SRSStateData` and `ts-fsrs`'s internal `Card` type on every compute call. This is ~10 lines and carries negligible overhead.

### ADR-3: `ConfidenceRating` changes from 0–5 to 1–4

**Decision:** Redefine `ConfidenceRating = 1 | 2 | 3 | 4` matching FSRS's `Rating.Again | Hard | Good | Easy`.

**Rationale:** The 6-button scale (0–5) is the direct cause of ease hell and inconsistent ease factors. Research and Anki both converge on 4 buttons. Since `ConfidenceRating` is a union type, the TypeScript compiler will flag every call site — the migration is safe and exhaustive.

**Consequences:** `RATING_LABELS`, `RATING_OPTIONS`, and the review page HTML all change. Session history `avgRating` display changes scale (1–4 instead of 0–5).

### ADR-4: Mastery derived from stability, not repetition count

**Decision:** `masteryLevel` is computed as a stability band rather than `floor(repetitions / 2)`.

**Rationale:** Mastery should mean "I have demonstrated I retain this word for months", not "I reviewed this 8 times". A stability of ≥180 days means the algorithm predicts you will remember it 6 months from now with 90% probability — that is mastery.

| Level | Label | Stability threshold |
|---|---|---|
| 0 | New | No reviews |
| 1 | Learning | < 7 days |
| 2 | Familiar | 7 – 30 days |
| 3 | Review | 30 – 90 days |
| 4 | Good | 90 – 180 days |
| 5 | Mastered | ≥ 180 days |

**Consequences:** Some cards that were "Mastered" under SM-2 will drop back to level 3 or 4 after migration because their stability (derived from interval) does not meet the 180-day threshold. This is correct — those cards were never truly mastered under SM-2's counting logic.

### ADR-5: Interval cap at 365 days

**Decision:** `intervalDays` is capped at 365. Words not reviewed for over a year are effectively relearned from scratch anyway.

**Rationale:** SM-2 produces 20,000-day intervals that silently remove words from active study. A 365-day cap ensures every card returns annually at minimum and prevents data corruption from ease-factor runaway.

---

## Non-goals (explicitly out of scope)

- Per-user FSRS parameter training (requires thousands of review logs; use default weights)
- Adaptive retention target (default 90% is correct for language learning)
- Daily review load balancing / review caps
- Fuzz factor / jitter on intervals
- Removing `easeFactor` / `repetitions` from the DB schema (deferred cleanup ticket)
- Changes to the Listen feature's passive review (no SRS in listen — already removed per LC-200 epic)
- Story keywords or quiz SRS (future epic)

---

## Story map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Install | LC-140 | Add `ts-fsrs` to the monorepo | 1 |
| 1 — Domain | LC-141 | Extend `SRSStateData` with FSRS fields | 2 |
| 1 — Domain | LC-142 | Redefine `ConfidenceRating` 0–5 → 1–4 | 2 |
| 2 — Shared utils | LC-143 | Add `computeFSRS()` and `freshFsrsState()` to shared utils | 2 |
| 3 — API | LC-144 | Migrate `CardsService` to FSRS | 3 |
| 3 — API | LC-145 | DB migration script for existing SRS states | 2 |
| 4 — Mobile service | LC-146 | Replace `Sm2Service` with `FsrsService` | 2 |
| 4 — Mobile service | LC-147 | Add `previewIntervals()` to `FsrsService` | 1 |
| 5 — Review UI | LC-148 | Rating buttons: 6 → 4 with interval previews | 3 |
| 5 — Review UI | LC-149 | Word detail mastery display (stability-based) | 2 |
| 6 — Docs | LC-150 | Update `CLAUDE.md` | 1 |

**Total: 21 points**

---

## Implementation order

Work through tickets in this exact sequence. Each ticket must leave `tsc --noEmit` green before the next begins.

```
LC-140 → LC-141 → LC-142 → LC-143 → LC-144 → LC-145
                                              ↓
                                           LC-146 → LC-147 → LC-148 → LC-149 → LC-150
```

LC-145 (DB migration) can be run in parallel with the mobile work once LC-144 is done.

---

---

## LC-140 · Add `ts-fsrs` to the monorepo

**Epic:** FSRS Migration
**Phase:** 0 — Install (do this first, unblocks everything)
**Points:** 1
**Depends on:** nothing

### User story

As a developer, I want `ts-fsrs` available as a shared dependency so that both the NestJS API and the Angular mobile app can import the FSRS scheduler without duplicating the implementation.

### Implementation

```bash
# Run from repo root
npm install ts-fsrs

# Verify the types resolve correctly
npx tsc --noEmit
```

Add to the root `package.json` (not app-level). Confirm `ts-fsrs` appears in `node_modules` and the monorepo's `tsconfig.base.json` path resolution works.

### Smoke test

```typescript
// Quick smoke test — run in ts-node or add as a temp script
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
const scheduler = fsrs();
const card = createEmptyCard();
const preview = scheduler.repeat(card, new Date());
console.log(preview[Rating.Good].card.scheduled_days); // should print ~1
```

### Acceptance criteria

- [ ] `ts-fsrs` listed in root `package.json` dependencies
- [ ] `import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'` resolves without error in both `apps/api` and `apps/mobile` contexts
- [ ] `tsc --noEmit` passes across the monorepo

---

---

## LC-141 · Extend `SRSStateData` with FSRS fields

**Epic:** FSRS Migration
**Phase:** 1 — Domain
**Points:** 2
**Depends on:** LC-140

### User story

As a developer, I want `SRSStateData` to carry FSRS's three memory variables so that the rest of the system can persist and read them without knowing `ts-fsrs` internals.

### Files to modify

| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Extend `SRSStateData`, add `FsrsRating` alias |

### Implementation

```typescript
// libs/shared/domain/src/index.ts

// ─── SRS TYPES ────────────────────────────────────────────────────────────────

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * FSRS 4-button rating scale.
 * Replaces the old ConfidenceRating 0–5 in a follow-up ticket (LC-142).
 * Defined here so the domain type and algorithm type stay in sync.
 *   1 = Again  (completely forgot)
 *   2 = Hard   (recalled with difficulty)
 *   3 = Good   (recalled correctly)
 *   4 = Easy   (recalled instantly)
 */
export type ConfidenceRating = 1 | 2 | 3 | 4;

export interface SRSStateData {
  id: string;
  cardId: string;
  userId: string;

  /** 'fsrs' after migration; 'sm2' for old un-migrated rows. */
  algorithm: 'sm2' | 'fsrs';

  // ─── Scheduling fields (used by both algorithms) ──────────────────────────
  intervalDays: number;
  nextDueAt: string;           // ISO string
  lastReviewedAt: string | null;
  lastRating: ConfidenceRating | null;
  masteryLevel: MasteryLevel;

  /** FSRS state string. 'relearning' replaces SM-2's reset-to-zero on failure. */
  state: 'new' | 'learning' | 'review' | 'relearning' | 'mastered';

  // ─── FSRS-specific fields (null for SM-2 rows until migration runs) ────────
  /**
   * Stability: days until recall probability drops to the target retention.
   * High = well-retained. Null before first FSRS review.
   */
  stability: number | null;

  /**
   * Difficulty: intrinsic hardness of this card for this user (1–10).
   * Updated after every review. Null before first FSRS review.
   */
  difficulty: number | null;

  /**
   * Retrievability: current probability of recall (0–1).
   * Computed field — derived from stability and elapsed time.
   * Stored for display purposes (word detail "recall chance").
   */
  retrievability: number | null;

  // ─── SM-2 legacy fields (kept during migration, removed in cleanup) ────────
  /** @deprecated Use stability instead. Kept for SM-2 rows. */
  easeFactor: number;
  /** @deprecated Not used by FSRS. Kept for SM-2 rows. */
  repetitions: number;
}
```

### Acceptance criteria

- [ ] `SRSStateData` has `stability`, `difficulty`, `retrievability` fields (all `number | null`)
- [ ] `ConfidenceRating` is `1 | 2 | 3 | 4` (not `0 | 1 | 2 | 3 | 4 | 5`)
- [ ] `SRSStateData.state` union includes `'relearning'`
- [ ] `SRSStateData.algorithm` accepts `'fsrs'`
- [ ] `tsc --noEmit` passes — TypeScript errors at call sites are expected (fixed in LC-142/LC-143)

---

---

## LC-142 · Redefine `ConfidenceRating` 0–5 → 1–4 across the codebase

**Epic:** FSRS Migration
**Phase:** 1 — Domain
**Points:** 2
**Depends on:** LC-141

### User story

As a user, I want to rate my recall with 4 clear options (Again / Hard / Good / Easy) instead of 6 confusing ones, so I can rate quickly and consistently without overthinking.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/models/review.model.ts` | Update all rating labels, options, mastery threshold |
| `apps/mobile/src/app/features/vault/components/quick-rate-sheet/quick-rate-sheet.component.ts` | No logic change — types auto-propagate |
| `libs/shared/testing/src/index.ts` | Update `SM2_RATING_CONFIG` → `FSRS_RATING_CONFIG` |

### Implementation

```typescript
// apps/mobile/src/app/features/review/models/review.model.ts

import type { Card, ConfidenceRating, MasteryLevel } from '@lingua-card/shared/domain';

// ─── MASTERY LABELS ────────────────────────────────────────────────────────────
// Unchanged — still 0–5. Labels updated to reflect stability-based meaning.

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  0: 'New',
  1: 'Learning',    // was 'Beginner'
  2: 'Familiar',    // was 'Learning'
  3: 'Review',      // unchanged
  4: 'Good',        // unchanged
  5: 'Mastered',    // unchanged
};

export const MASTERY_COLOURS: Record<MasteryLevel, string> = {
  0: '#D1D5DB',
  1: '#FCA5A5',
  2: '#FCD34D',
  3: '#6EE7B7',
  4: '#34D399',
  5: '#059669',
};

// ─── CONFIDENCE RATINGS (4-button FSRS scale) ─────────────────────────────────

export const RATING_LABELS: Record<ConfidenceRating, string> = {
  1: 'Again',   // was: Blank (0), Hard (1), Hmm (2)
  2: 'Hard',    // was: Good (3)
  3: 'Good',    // was: Easy (4)
  4: 'Easy',    // was: Nailed (5)
};

export const RATING_DESCRIPTIONS: Record<ConfidenceRating, string> = {
  1: 'Completely forgot',
  2: 'Recalled with effort',
  3: 'Recalled correctly',
  4: 'Recalled instantly',
};

export interface RatingOption {
  value: ConfidenceRating;
  label: string;
  description: string;
  /** Next interval in days — populated by FsrsService.previewIntervals() before render */
  previewDays?: number;
}

export const RATING_OPTIONS: RatingOption[] = [
  { value: 1, label: 'Again', description: 'Completely forgot' },
  { value: 2, label: 'Hard',  description: 'Recalled with effort' },
  { value: 3, label: 'Good',  description: 'Recalled correctly' },
  { value: 4, label: 'Easy',  description: 'Recalled instantly' },
];

/**
 * Ratings below this threshold reset the card's learning progress.
 * Rating 1 (Again) and 2 (Hard) are both < MASTERY_THRESHOLD.
 */
export const MASTERY_THRESHOLD: ConfidenceRating = 3;
```

### Acceptance criteria

- [ ] `ConfidenceRating` is `1 | 2 | 3 | 4` throughout the codebase
- [ ] `RATING_OPTIONS` has exactly 4 items
- [ ] `RATING_LABELS` keys are `1 | 2 | 3 | 4`
- [ ] `MASTERY_THRESHOLD` is `3` (meaning ratings 1 and 2 = not mastered in session)
- [ ] All TypeScript errors introduced by the type change are fixed
- [ ] `tsc --noEmit` passes

---

---

## LC-143 · Add `computeFSRS()` and `freshFsrsState()` to shared utils

**Epic:** FSRS Migration
**Phase:** 2 — Shared utils
**Points:** 2
**Depends on:** LC-141, LC-142

### User story

As a developer, I want a single canonical FSRS compute function in `libs/shared/utils` so that both the API and the mobile app use identical scheduling logic with no duplication.

### Files to modify

| File | Change |
|---|---|
| `libs/shared/utils/src/index.ts` | Add `computeFSRS()`, `freshFsrsState()`, `stabilityToMastery()`, `MAX_INTERVAL_DAYS` |

### Implementation

```typescript
// libs/shared/utils/src/index.ts
// Add these exports alongside existing date helpers.
// Do NOT remove computeSM2 yet — needed for LC-145 migration script.

import { createEmptyCard, fsrs, Rating, type Card as FsrsCard } from 'ts-fsrs';
import type { ConfidenceRating, MasteryLevel, SRSStateData } from '@lingua-card/shared/domain';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** No word should be reviewed less than once per year. */
export const MAX_INTERVAL_DAYS = 365;

/**
 * Target retention rate: 90% recall probability at time of next review.
 * Standard for language learning; matches Anki's default.
 */
export const TARGET_RETENTION = 0.9;

/**
 * Stability thresholds (days) for each mastery level.
 * A card reaches level N when its stability >= MASTERY_STABILITY_THRESHOLDS[N].
 */
export const MASTERY_STABILITY_THRESHOLDS: Record<MasteryLevel, number> = {
  0: 0,    // New — no reviews
  1: 0,    // Learning — first review done, stability < 7
  2: 7,    // Familiar — stability 7–30 days
  3: 30,   // Review — stability 30–90 days
  4: 90,   // Good — stability 90–180 days
  5: 180,  // Mastered — stability ≥ 180 days
};

// ─── FSRS SCHEDULER (module-level singleton) ──────────────────────────────────
// Initialized once — safe across both Node.js and browser environments.
const scheduler = fsrs({ request_retention: TARGET_RETENTION, maximum_interval: MAX_INTERVAL_DAYS });

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Maps FSRS state string to SRSStateData['state'].
 * ts-fsrs State enum: 0=New, 1=Learning, 2=Review, 3=Relearning
 */
function fsrsStateToSrsState(fsrsState: number, masteryLevel: MasteryLevel): SRSStateData['state'] {
  if (masteryLevel >= 5) return 'mastered';
  switch (fsrsState) {
    case 0: return 'new';
    case 1: return 'learning';
    case 3: return 'relearning';
    default: return 'review';
  }
}

/**
 * Convert our ConfidenceRating (1–4) to ts-fsrs Rating enum.
 * FSRS: 1=Again, 2=Hard, 3=Good, 4=Easy — identical mapping.
 */
function toFsrsRating(rating: ConfidenceRating): Rating {
  return rating as unknown as Rating;
}

/**
 * Build a ts-fsrs Card from our SRSStateData for scheduler input.
 * Handles both fresh cards and existing FSRS / legacy SM-2 cards.
 */
function toFsrsCard(state: SRSStateData): FsrsCard {
  const now = new Date();
  const lastReview = state.lastReviewedAt ? new Date(state.lastReviewedAt) : undefined;

  // If card already has FSRS fields, reconstruct the ts-fsrs Card shape
  if (state.algorithm === 'fsrs' && state.stability !== null && state.difficulty !== null) {
    return {
      due: new Date(state.nextDueAt),
      stability: state.stability,
      difficulty: state.difficulty,
      elapsed_days: lastReview ? Math.floor((now.getTime() - lastReview.getTime()) / 86_400_000) : 0,
      scheduled_days: state.intervalDays,
      reps: 0,           // ts-fsrs v4 doesn't use reps for scheduling
      lapses: 0,
      state: state.state === 'new' ? 0 : state.state === 'learning' ? 1 : state.state === 'relearning' ? 3 : 2,
      last_review: lastReview,
    } as FsrsCard;
  }

  // Fresh card or SM-2 card without stability — start from a blank FSRS card
  return createEmptyCard(lastReview ?? now);
}

// ─── COMPUTE FSRS ─────────────────────────────────────────────────────────────

/**
 * Canonical FSRS compute function.
 * Called by: FsrsService (mobile), CardsService (API).
 * Never call ts-fsrs directly in features.
 */
export function computeFSRS(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
  const fsrsCard = toFsrsCard(state);
  const now = new Date();
  const result = scheduler.next(fsrsCard, now, toFsrsRating(rating));
  const next = result.card;

  const intervalDays = Math.min(next.scheduled_days, MAX_INTERVAL_DAYS);
  const stability = next.stability ?? state.stability ?? 1;
  const difficulty = next.difficulty ?? state.difficulty ?? 5;
  const retrievability = scheduler.get_retrievability(next) ?? null;
  const masteryLevel = stabilityToMastery(stability);

  return {
    ...state,
    algorithm: 'fsrs',
    intervalDays,
    nextDueAt: new Date(Date.now() + intervalDays * 86_400_000).toISOString(),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    stability,
    difficulty,
    retrievability,
    masteryLevel,
    state: fsrsStateToSrsState(next.state as unknown as number, masteryLevel),
    // Legacy fields — update so existing displays don't break
    easeFactor: state.easeFactor,
    repetitions: state.repetitions + (rating >= 3 ? 1 : 0),
  };
}

/**
 * Preview next interval for all four ratings without mutating state.
 * Used to show "Again → 1d | Hard → 4d | Good → 12d | Easy → 45d" on rating buttons.
 */
export function previewFsrsIntervals(state: SRSStateData): Record<ConfidenceRating, number> {
  const fsrsCard = toFsrsCard(state);
  const now = new Date();
  const preview = scheduler.repeat(fsrsCard, now);

  return {
    1: Math.min(preview[Rating.Again].card.scheduled_days, MAX_INTERVAL_DAYS),
    2: Math.min(preview[Rating.Hard].card.scheduled_days, MAX_INTERVAL_DAYS),
    3: Math.min(preview[Rating.Good].card.scheduled_days, MAX_INTERVAL_DAYS),
    4: Math.min(preview[Rating.Easy].card.scheduled_days, MAX_INTERVAL_DAYS),
  };
}

/**
 * Derive mastery level from FSRS stability value.
 * Stability is "days until 90% recall probability drops below threshold".
 */
export function stabilityToMastery(stability: number | null): MasteryLevel {
  if (stability === null) return 0;
  if (stability >= 180) return 5;
  if (stability >= 90)  return 4;
  if (stability >= 30)  return 3;
  if (stability >= 7)   return 2;
  return 1;
}

/**
 * Fresh FSRS state for a new card.
 */
export function freshFsrsState(cardId: string, userId: string, idFn: () => string = defaultUUID): SRSStateData {
  return {
    id: idFn(),
    cardId,
    userId,
    algorithm: 'fsrs',
    intervalDays: 1,
    nextDueAt: new Date().toISOString(),
    lastReviewedAt: null,
    lastRating: null,
    masteryLevel: 0,
    state: 'new',
    stability: null,
    difficulty: null,
    retrievability: null,
    // Legacy fields — initialised to SM-2 defaults to avoid null issues
    easeFactor: 2.5,
    repetitions: 0,
  };
}
```

### Acceptance criteria

- [ ] `computeFSRS(state, rating)` returns a valid `SRSStateData` with `algorithm: 'fsrs'`
- [ ] `previewFsrsIntervals(state)` returns `Record<1|2|3|4, number>` with all four intervals
- [ ] `stabilityToMastery(stability)` returns correct level for each threshold
- [ ] `freshFsrsState()` returns a card with `stability: null`, `algorithm: 'fsrs'`
- [ ] `MAX_INTERVAL_DAYS = 365` — no interval ever exceeds this
- [ ] Both functions are exported from the lib barrel
- [ ] `tsc --noEmit` passes across the monorepo

---

---

## LC-144 · Migrate `CardsService` to FSRS

**Epic:** FSRS Migration
**Phase:** 3 — API
**Points:** 3
**Depends on:** LC-143

### User story

As the system, I want the backend to schedule reviews using FSRS so that `nextDueAt` intervals are accurate and bounded regardless of rating history.

### Files to modify

| File | Change |
|---|---|
| `apps/api/src/cards/cards.service.ts` | Replace `computeSm2()` with `computeFSRS()`, update `freshSrsState()` |

### Implementation

```typescript
// apps/api/src/cards/cards.service.ts

// ─── Replace the private computeSm2() method entirely ────────────────────────

import { computeFSRS, freshFsrsState } from '@lingua-card/shared/utils';
import type { ConfidenceRating, SRSStateData } from '@lingua-card/shared/domain';

// In batchRateSrs():
for (const rating of ratings) {
  const entity = entityMap.get(rating.cardId);
  if (!entity) continue;
  const existing: SRSStateData = entity.srsState ?? freshFsrsState(entity.id, userId);
  entity.srsState = computeFSRS(existing, rating.rating as ConfidenceRating);
}

// Remove the private computeSm2() method — it is no longer called.
// Remove the private freshSrsState() method — use freshFsrsState() from shared utils.

// In rateCard() (single-card endpoint):
const existing: SRSStateData = entity.srsState ?? freshFsrsState(entity.id, userId);
entity.srsState = computeFSRS(existing, dto.rating as ConfidenceRating);
```

### Note on the `stability` / `difficulty` / `retrievability` columns

The `srsState` JSONB column already stores the full `SRSStateData` object. Adding `stability`, `difficulty`, and `retrievability` fields to the JSON object requires no DB schema migration — they are new keys inside the existing JSONB blob. Cards reviewed before this migration will have `stability: null` until they are next reviewed (at which point FSRS initialises them from scratch via `createEmptyCard`).

### Acceptance criteria

- [ ] `POST /cards/:id/rate` with rating `1|2|3|4` updates `srsState.algorithm` to `'fsrs'`
- [ ] `POST /cards/:id/rate` with rating `3` (Good) on a fresh card sets `intervalDays` to 1
- [ ] `POST /cards/:id/rate` with rating `4` (Easy) 10 times never exceeds `intervalDays: 365`
- [ ] `srsState.stability`, `.difficulty`, `.retrievability` are present and non-null after first review
- [ ] `srsState.masteryLevel` is derived from stability band, not repetition count
- [ ] No call to `computeSm2` or local `freshSrsState` remains in `cards.service.ts`
- [ ] `tsc --noEmit` passes in `apps/api`

---

---

## LC-145 · DB migration script for existing SRS states

**Epic:** FSRS Migration
**Phase:** 3 — API (can run in parallel with mobile work)
**Points:** 2
**Depends on:** LC-144

### User story

As the system, I want existing SM-2 SRS states migrated to approximate FSRS equivalents so that users' review history and mastery levels are preserved after the upgrade.

### Context

Every card reviewed before this epic has `srsState.algorithm: 'sm2'` and `stability: null`. The FSRS scheduler handles null stability gracefully — it starts fresh — but this gives veteran users an inaccurate mastery level (everything resets to 0). The migration script approximates FSRS fields from SM-2 fields.

**Migration approximations:**
- `stability ≈ intervalDays` (SM-2's interval is a crude proxy for memory stability)
- `difficulty ≈ 10 - (avgRating - 1) * 2.25` (maps 1–4 rating average to 1–10 difficulty, inverted)
- `retrievability` = recomputed from stability and days since last review
- `masteryLevel` = recomputed from the approximated stability

### Files to create

```
apps/api/src/scripts/migrate-srs-to-fsrs.ts
```

### Implementation

```typescript
// apps/api/src/scripts/migrate-srs-to-fsrs.ts

import { DataSource } from 'typeorm';
import { CardEntity } from '../cards/card.entity';
import { stabilityToMastery } from '@lingua-card/shared/utils';
import type { SRSStateData } from '@lingua-card/shared/domain';

async function migrate(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(CardEntity);
  const cards = await repo.find();
  let updated = 0;

  for (const card of cards) {
    const s = card.srsState;
    if (!s || s.algorithm === 'fsrs') continue;   // skip if already migrated or null

    // Approximate stability from SM-2 interval
    const stability = s.intervalDays ?? 1;

    // Approximate difficulty: invert avg rating (1–4 scale → difficulty 1–10)
    // lastRating may still be 0–5 for legacy rows — clamp to new range
    const rawRating = Math.max(1, Math.min(4, s.lastRating ?? 3));
    const difficulty = Math.round(10 - (rawRating - 1) * 3);

    // Retrievability: days elapsed since last review
    const daysSince = s.lastReviewedAt
      ? Math.floor((Date.now() - new Date(s.lastReviewedAt).getTime()) / 86_400_000)
      : 0;
    // Ebbinghaus forgetting curve approximation: R = e^(-daysSince/stability)
    const retrievability = stability > 0
      ? Math.round(Math.exp(-daysSince / stability) * 1000) / 1000
      : 0;

    const masteryLevel = s.state === 'new' ? 0 : stabilityToMastery(stability);

    const updated_state: SRSStateData = {
      ...s,
      algorithm: 'fsrs',
      stability,
      difficulty,
      retrievability,
      masteryLevel,
    };

    card.srsState = updated_state;
    updated++;
  }

  await repo.save(cards);
  console.log(`Migrated ${updated} cards from SM-2 → FSRS.`);
}

// Entry point
const ds = new DataSource({ /* inject from env */ });
ds.initialize().then(() => migrate(ds)).finally(() => ds.destroy());
```

### Running the migration

```bash
# From apps/api
npx ts-node src/scripts/migrate-srs-to-fsrs.ts
```

Run once against production after deploying LC-144.

### Acceptance criteria

- [ ] Script runs without error against a seeded development database
- [ ] All `srsState.algorithm` values are `'fsrs'` after the script
- [ ] `srsState.stability`, `.difficulty`, `.retrievability` are non-null after migration
- [ ] `srsState.masteryLevel` reflects stability bands (cards with `intervalDays < 7` are level 1, not 4 or 5)
- [ ] Script is idempotent — running it twice produces the same result (cards with `algorithm: 'fsrs'` are skipped)
- [ ] Script logs the count of migrated cards

---

---

## LC-146 · Replace `Sm2Service` with `FsrsService` in `shared/srs/`

**Epic:** FSRS Migration
**Phase:** 4 — Mobile service
**Points:** 2
**Depends on:** LC-143

### User story

As a developer, I want an `FsrsService` in `shared/srs/` so that review and vault features use FSRS scheduling without touching `ts-fsrs` directly.

### Files to modify / create

| File | Change |
|---|---|
| `apps/mobile/src/app/shared/srs/fsrs.service.ts` | **Create** — new service, wraps `computeFSRS` and `previewFsrsIntervals` |
| `apps/mobile/src/app/shared/srs/sm2.service.ts` | **Deprecate** — add `@deprecated` JSDoc, do not delete yet |
| `apps/mobile/src/app/features/review/store/review.store.ts` | Switch injection from `Sm2Service` to `FsrsService` |

### Implementation

```typescript
// apps/mobile/src/app/shared/srs/fsrs.service.ts

import { Injectable } from '@angular/core';
import type { ConfidenceRating, SRSStateData } from '@lingua-card/shared/domain';
import { computeFSRS, freshFsrsState, previewFsrsIntervals } from '@lingua-card/shared/utils';

@Injectable({ providedIn: 'root' })
export class FsrsService {

  /**
   * Apply a rating to a card's SRS state and return the updated state.
   * Used by ReviewStore.rateCard() for optimistic local updates.
   */
  compute(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    return computeFSRS(state, rating);
  }

  /**
   * Preview next intervals for all four ratings without mutating state.
   * Called before the rating buttons render so each button shows its interval.
   */
  previewIntervals(state: SRSStateData): Record<ConfidenceRating, number> {
    return previewFsrsIntervals(state);
  }

  /**
   * Create a fresh SRS state for a newly added card.
   */
  freshState(cardId: string, userId: string): SRSStateData {
    return freshFsrsState(cardId, userId);
  }
}
```

```typescript
// Update review.store.ts — swap Sm2Service for FsrsService

// BEFORE:
private readonly sm2 = inject(Sm2Service);
// ...
const updated = this.sm2.compute(existing, rating);

// AFTER:
private readonly fsrs = inject(FsrsService);
// ...
const updated = this.fsrs.compute(existing, rating);
```

### Acceptance criteria

- [ ] `FsrsService` exists at `apps/mobile/src/app/shared/srs/fsrs.service.ts`
- [ ] `FsrsService.compute()` delegates to `computeFSRS` from shared utils
- [ ] `FsrsService.previewIntervals()` delegates to `previewFsrsIntervals`
- [ ] `ReviewStore` imports and injects `FsrsService`, not `Sm2Service`
- [ ] `Sm2Service` still exists (with `@deprecated` JSDoc) — not deleted until cleanup sprint
- [ ] `tsc --noEmit` passes in `apps/mobile`

---

---

## LC-147 · Add `previewIntervals()` call in the review page

**Epic:** FSRS Migration
**Phase:** 4 — Mobile service
**Points:** 1
**Depends on:** LC-146

### User story

As a user, I want to see the next review interval for each rating button before I tap, so I can make an informed decision about my rating.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.ts` | Add `intervalPreviews` computed signal |

### Implementation

```typescript
// apps/mobile/src/app/features/review/pages/review/review.page.ts

private readonly fsrs = inject(FsrsService);

/**
 * Next intervals for the current card, keyed by ConfidenceRating.
 * Recomputes whenever the current card changes.
 * null when card is not yet flipped (don't distract before revealing).
 */
readonly intervalPreviews = computed<Record<ConfidenceRating, number> | null>(() => {
  const card = this.currentCard();
  if (!card?.srsState) return null;
  return this.fsrs.previewIntervals(card.srsState);
});

/**
 * Rating options with preview days injected — passed to the rating bar template.
 */
readonly ratingOptionsWithPreviews = computed<RatingOption[]>(() => {
  const previews = this.intervalPreviews();
  return RATING_OPTIONS.map(opt => ({
    ...opt,
    previewDays: previews?.[opt.value] ?? null,
  }));
});
```

```html
<!-- review.page.html — rating buttons section -->
<!-- Show previews only after card is flipped -->
@if (isFlipped()) {
  <div class="rating-bar">
    @for (opt of ratingOptionsWithPreviews(); track opt.value) {
      <button
        class="rating-btn rating-btn--{{ opt.value }}"
        (click)="submitRating(opt.value)">
        <span class="rating-btn__label">{{ opt.label }}</span>
        @if (opt.previewDays !== null) {
          <span class="rating-btn__interval">
            {{ opt.previewDays === 1 ? '1 day' : opt.previewDays + 'd' }}
          </span>
        }
      </button>
    }
  </div>
}
```

### Acceptance criteria

- [ ] Rating buttons show the predicted interval when the card is flipped
- [ ] Intervals are hidden before the card is flipped (no peeking the answer)
- [ ] "1 day" displays as "1 day" not "1d" (special-cased for readability)
- [ ] Intervals > 365 never appear (capped upstream in `previewFsrsIntervals`)
- [ ] `tsc --noEmit` passes

---

---

## LC-148 · Rating buttons: 6 → 4 with interval preview UI

**Epic:** FSRS Migration
**Phase:** 5 — Review UI
**Points:** 3
**Depends on:** LC-147

### User story

As a user reviewing a card, I want to see four clearly-labelled rating buttons with their interval previews, so the rating UI is simple, fast, and informative.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.rating.scss` | Rewrite rating bar styles for 4 buttons |
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Update rating bar HTML |
| `apps/mobile/src/app/features/vault/components/quick-rate-sheet/quick-rate-sheet.component.html` | Same 4-button update |

### Rating button design

Each button has two lines: label (bold, 14px) and interval preview (muted, 11px). The four buttons sit in a horizontal row with equal width. Color-coding:

| Rating | Label | Color intent |
|---|---|---|
| 1 — Again | Again | Red tint |
| 2 — Hard | Hard | Amber tint |
| 3 — Good | Good | Green tint |
| 4 — Easy | Easy | Brand green |

### SCSS patterns

```scss
// apps/mobile/src/app/features/review/pages/review/review.rating.scss

.rating-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
}

.rating-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 4px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform 0.1s ease, opacity 0.1s ease;
  background: transparent;

  &:active {
    transform: scale(0.96);
    opacity: 0.85;
  }

  &__label {
    font-family: var(--lc-font-body);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    margin-bottom: 4px;
  }

  &__interval {
    font-family: var(--lc-font-body);
    font-size: 10px;
    font-weight: 400;
    opacity: 0.7;
  }

  // Rating-specific colors
  &--1 {
    background: rgba(231, 76, 60, 0.08);
    border-color: rgba(231, 76, 60, 0.2);
    .rating-btn__label { color: #c0392b; }
  }

  &--2 {
    background: rgba(230, 126, 34, 0.08);
    border-color: rgba(230, 126, 34, 0.2);
    .rating-btn__label { color: #ba6914; }
  }

  &--3 {
    background: rgba(45, 90, 78, 0.08);
    border-color: rgba(45, 90, 78, 0.2);
    .rating-btn__label { color: var(--lc-brand); }
  }

  &--4 {
    background: var(--lc-brand);
    border-color: var(--lc-brand);
    .rating-btn__label { color: white; }
    .rating-btn__interval { color: rgba(255,255,255,0.75); opacity: 1; }
  }
}
```

### Acceptance criteria

- [ ] Exactly 4 rating buttons rendered (Again / Hard / Good / Easy)
- [ ] Each button shows label + interval preview (e.g. "Good · 12d")
- [ ] Again button has red tint, Hard amber, Good soft-green, Easy brand green
- [ ] Quick-rate sheet also uses 4 buttons (same HTML/SCSS)
- [ ] Old `RATING_OPTIONS` with 6 entries is gone — no dead code
- [ ] Tapping a button immediately advances to the next card (no change to flow)
- [ ] `tsc --noEmit` passes

---

---

## LC-149 · Word detail mastery display (stability-based)

**Epic:** FSRS Migration
**Phase:** 5 — Review UI
**Points:** 2
**Depends on:** LC-143, LC-146

### User story

As a user on the Word Detail screen, I want to see my stability and retrievability alongside mastery level, so I understand my actual memory state rather than just a repetition count.

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/pages/word-detail/word-detail.page.html` | Add stability + retrievability to Mastery Progress section |
| `apps/mobile/src/app/features/vault/pages/word-detail/word-detail.page.ts` | Add computed signals for formatted stability/retrievability display |

### New computed signals

```typescript
// word-detail.page.ts

/** Human-readable stability: "12 days", "3 months", "1.5 years" */
readonly stabilityLabel = computed(() => {
  const s = this.card()?.srsState?.stability;
  if (s === null || s === undefined) return '—';
  if (s < 30)  return `${Math.round(s)} days`;
  if (s < 365) return `${Math.round(s / 30 * 10) / 10} months`;
  return `${Math.round(s / 365 * 10) / 10} years`;
});

/** Recall probability as percentage: "87%" */
readonly retrievabilityLabel = computed(() => {
  const r = this.card()?.srsState?.retrievability;
  if (r === null || r === undefined) return '—';
  return `${Math.round(r * 100)}%`;
});

/** "Next review in X days / Tomorrow / Today" */
readonly nextReviewLabel = computed(() => {
  const state = this.card()?.srsState;
  if (!state) return '—';
  const days = Math.round((new Date(state.nextDueAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Tomorrow';
  if (days < 365) return `Next review in ${days} days`;
  return `Next review in ${Math.round(days / 365 * 10) / 10} years`;
});
```

### Mastery Progress section layout (new stat grid)

Replace the existing 4-stat grid (Reviews / Avg rating / Interval / Last seen) with:

| Stat | Source |
|---|---|
| Reviews | `srsState.repetitions` |
| Recall chance | `retrievabilityLabel` — e.g. "87%" |
| Stability | `stabilityLabel` — e.g. "45 days" |
| Last seen | existing logic |

### Acceptance criteria

- [ ] Word detail Mastery Progress section shows Recall chance (retrievability %) and Stability (days/months/years)
- [ ] "Interval" stat is replaced by "Stability" (stability is more meaningful)
- [ ] "Avg rating" stat is replaced by "Recall chance" (retrievability is more actionable)
- [ ] Cards with `stability: null` (pre-migration) show "—" for both new stats
- [ ] Mastery level badge still shows the correct level derived from stability
- [ ] No interval > 365 days ever appears in the UI (the old 20,172d bug is gone)
- [ ] `tsc --noEmit` passes

---

---

## LC-150 · Update `CLAUDE.md`

**Epic:** FSRS Migration
**Phase:** 6 — Docs
**Points:** 1
**Depends on:** all tickets above

### Files to modify

| File | Change |
|---|---|
| `CLAUDE.md` | Update SRS algorithm section, epic table, tech debt register |
| `apps/mobile/epic-fsrs-migration.md` | Copy this file to the project |

### `CLAUDE.md` — SRS algorithm section replacement

Replace the existing `## SRS algorithm (SM-2)` section with:

```markdown
## SRS algorithm (FSRS)

Rating 1–4 maps to: Again / Hard / Good / Easy.

- **Algorithm:** FSRS-5 via `ts-fsrs` npm package. Canonical logic in `libs/shared/utils/src/index.ts` (`computeFSRS`, `previewFsrsIntervals`, `stabilityToMastery`).
- **Mobile service:** `shared/srs/fsrs.service.ts` — features call `FsrsService`, never `ts-fsrs` directly
- **Rating scale:** 1=Again / 2=Hard / 3=Good / 4=Easy (4 buttons, not 6)
- **Interval cap:** MAX_INTERVAL_DAYS = 365. No card disappears for longer than a year.
- **Target retention:** 90% recall probability at time of next review.
- **Mastery levels** are derived from FSRS stability (days), not repetition count:
  | Level | Label    | Stability threshold |
  |-------|----------|---------------------|
  | 0     | New      | No reviews          |
  | 1     | Learning | < 7 days            |
  | 2     | Familiar | 7–30 days           |
  | 3     | Review   | 30–90 days          |
  | 4     | Good     | 90–180 days         |
  | 5     | Mastered | ≥ 180 days          |
- **SM-2 legacy:** `Sm2Service` and `computeSM2` are deprecated but not deleted. Remove in cleanup sprint.
- **DB migration:** `apps/api/src/scripts/migrate-srs-to-fsrs.ts` — run once on production after deploy.
```

### `CLAUDE.md` — epic table addition

```markdown
| 14 | FSRS Migration | ✅ Implemented | `libs/shared/utils`, `shared/srs/fsrs.service.ts`, `apps/mobile/epic-fsrs-migration.md` |
```

### `CLAUDE.md` — tech debt addition

```markdown
| `Sm2Service` / `computeSM2` | Deprecated, still present | Delete after FSRS migration is stable in prod | FSRS cleanup sprint |
| `easeFactor`, `repetitions` in SRSStateData | Legacy SM-2 fields, still populated | Remove after DB backfill confirms no consumer reads them | FSRS cleanup sprint |
```

### Acceptance criteria

- [ ] `CLAUDE.md` SRS section describes FSRS, not SM-2
- [ ] `CLAUDE.md` epic table includes Epic 14
- [ ] Tech debt register documents the SM-2 cleanup items
- [ ] Epic file copied to `apps/mobile/epic-fsrs-migration.md`

---

## Implementation order (final summary)

```
LC-140 (install ts-fsrs)
  └─> LC-141 (extend SRSStateData)
        └─> LC-142 (ConfidenceRating 0-5 → 1-4)
              └─> LC-143 (computeFSRS + previewFsrsIntervals in shared utils)
                    ├─> LC-144 (API: CardsService → FSRS)
                    │     └─> LC-145 (DB migration script)
                    └─> LC-146 (mobile: FsrsService)
                          └─> LC-147 (previewIntervals in review page)
                                └─> LC-148 (rating buttons UI)
                                └─> LC-149 (word detail mastery display)
                                      └─> LC-150 (CLAUDE.md docs)
```
