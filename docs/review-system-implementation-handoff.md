# Review System Implementation Handoff

## Purpose

This document feeds the current LinguaCard implementation back into the review-system design process. It records:

- what was implemented;
- what was deliberately removed;
- the current domain and persistence contracts;
- how cards currently reach the review player;
- why the player can currently receive no cards;
- gaps between the reference design and the application integration;
- recommended next planning and implementation steps.

The application is still at MVP stage. No compatibility with the former SRS/FSRS state is intended.

## Executive summary

The old numeric mastery and FSRS-based review system was replaced with a client-owned, offline-first scheduling model. A review is calculated and committed on the client, written to a local outbox, applied optimistically to the local card, and later synchronized to the API. The API persists the committed event and the resulting card state transactionally and idempotently.

The scheduling and commit path is present and tested. The weakest part of the current integration is the path that supplies cards to a session. Card acquisition still depends on pre-existing `CardStore`, route, and page logic. The pure session-selection functions from the reference implementation are not yet driving the review player.

The most likely immediate reason for an empty player is that direct/default navigation to `/review/player` reads `CardStore.dueCards()`. That selector intentionally contains only previously reviewed cards whose `reviewState.dueAt` has passed. It excludes cards with no `reviewState`, even though those cards are considered new and should be eligible for a daily/new-card queue. A queue assembled by the review hub works differently: it includes both due and new cards and passes them through `ReviewStore.pendingQueue`.

There is also a loading race: `CardStore.isLoading` initially starts as `false`, while `loadCards()` performs an asynchronous cache read before changing it to `true`. `ReviewPage` waits for the first `isLoading === false` emission and may therefore select from an empty store before card loading actually starts.

These queue-input and loading issues should be addressed before further scheduler tuning.

## Scope of the completed replacement

### Removed

- `SRSStateData` and the old `srsState` card property.
- Numeric `ConfidenceRating` values.
- Numeric persisted mastery levels.
- SM-2/FSRS scheduling utilities and the `ts-fsrs` dependency.
- The client `FsrsService`.
- The old pending-SRS-rating buffer and sync handler.
- The server `POST /cards/srs/batch` endpoint.
- The old server-side rating recomputation path.
- The FSRS migration script.
- Compatibility projections between old and new review state.

Existing database rows are not translated from the old state. A card returned without `reviewState` is treated as new.

### Added

- Pure TypeScript scheduling, review commit, session-selection, manual-mastery, leech, and engagement-projection functions.
- A canonical five-stage persisted review state.
- String review ratings.
- Client-side schedule preview and commit through the same scheduler.
- A local committed-review outbox.
- Local committed-event history for engagement projections.
- Idempotent review-commit synchronization.
- A transactional NestJS review-commit endpoint.
- Database uniqueness for `eventId` and `attemptId`.
- Timestamp-guarded atomic updates of the card's latest review state.
- Runtime validation of incoming review commit payloads.
- Validated review-session DTOs.

## Canonical shared types

The shared application contract is in `libs/shared/domain/src/index.ts`.

```ts
export type LearningStage =
  | 'new'
  | 'learning'
  | 'familiar'
  | 'strong'
  | 'mastered';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewSchedulingState {
  cardId: string;
  stage: LearningStage;
  intervalMinutes?: number;
  dueAt?: string;
  masterySource?: 'earned' | 'manual';
  manualMasterySnapshot?: {
    previousStage: LearningStage;
    previousIntervalMinutes?: number;
    previousDueAt?: string;
  };
  relearning?: {
    previousStage: 'learning' | 'familiar' | 'strong' | 'mastered';
    previousIntervalMinutes: number;
    step: 'immediate' | 'one_day' | 'final';
  };
  problemStatus: 'normal' | 'leech';
  totalReviewCount: number;
  totalAgainCount: number;
  recentRatings: ReviewRating[];
  successfulReviewsSinceLastAgain: number;
}

export interface Card {
  id: string;
  deckId: string;
  collectionId: string | null;
  userId: string;
  contextId: string;
  content: CardContent;
  categoryIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  reviewState?: ReviewSchedulingState;
}
```

Important invariants:

- `new`, `learning`, `familiar`, `strong`, and `mastered` are the only persisted stages.
- Relearning is orthogonal state, not a sixth stage.
- Leech status is orthogonal state, not a stage.
- Intervals are integer minutes.
- Dates cross persistence and transport boundaries as ISO strings.
- Overdue is derived from `dueAt`; it is not persisted.
- Manual mastery is explicit through `masterySource: 'manual'` and a restoration snapshot.
- A card without `reviewState` is considered new.

## Pure client domain

The domain implementation is in:

`apps/mobile/src/app/features/review/domain/review-domain.ts`

The important pure operations are:

```ts
createNewSchedulingState(cardId)
deriveLearningStage(intervalMinutes, config)
isCardDue(state, now)
isCardOverdue(state, now)
scheduleReview(state, rating, reviewedAt, config)
previewRatings(state, reviewedAt, config)
commitReview(state, command, config)
markAsMastered(state)
undoManualMastery(state, now, config)
createReviewSession(definition)
selectNextCard(session, cards, now)
recordPresentation(session, selection)
recordSessionReview(session, cardId, presentationKind)
skipSessionCard(session, cardId, presentationKind)
projectDailyProgress(current, event, dateKey)
```

`previewRatings()` and `commitReview()` both call the same scheduler. Previewing a rating therefore cannot use a different algorithm from committing it.

The reference session-selection functions exist, but the Angular review player does not yet use them. The current player still walks a simple `Card[]` by index.

## Review commit contracts

The client creates one logical review through `commitReview()`.

```ts
interface ReviewRecord {
  reviewId: string;
  attemptId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  reviewMode: 'typing' | 'recall';
  promptDirection: 'source_to_target' | 'target_to_source';
  responseType: 'self_rated' | 'typed_answer' | 'dont_know';
  rating: ReviewRating;
  stageBefore: LearningStage;
  stageAfter: LearningStage;
  problemStatusBefore: 'normal' | 'leech';
  problemStatusAfter: 'normal' | 'leech';
  intervalBeforeMinutes?: number;
  intervalAfterMinutes?: number;
  wasRelearning: boolean;
}

interface ReviewCommittedEvent {
  type: 'ReviewCommitted';
  schemaVersion: 1;
  eventId: string;
  reviewId: string;
  attemptId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  mode: 'typing' | 'recall';
  direction: 'source_to_target' | 'target_to_source';
  responseType: 'self_rated' | 'typed_answer' | 'dont_know';
  rating: ReviewRating;
  stageBefore: LearningStage;
  stageAfter: LearningStage;
  intervalBeforeMinutes?: number;
  intervalAfterMinutes?: number;
  becameMastered: boolean;
  lostMastery: boolean;
  becameLeech: boolean;
  recoveredFromLeech: boolean;
  wasRelearning: boolean;
}

interface PendingReviewCommit {
  event: ReviewCommittedEventWithIsoDate;
  record: ReviewRecordWithIsoDate;
  nextState: ReviewSchedulingState;
}
```

IDs are generated on the client. `eventId` and `attemptId` serve separate idempotency constraints.

## Current offline-first write flow

```text
User selects a rating
  -> ReviewPage.submitRating()
  -> ReviewStore.rateCard()
  -> resolve the newest card from CardStore
  -> commitReview(currentState, command)
  -> serialize Date values to ISO strings
  -> write PendingReviewCommit to IndexedDB outbox
  -> write ReviewCommitted event to bounded local activity history
  -> update CardStore with next reviewState
  -> update active session rating
  -> enqueue FLUSH_REVIEW_COMMITS
  -> allow the player to advance
```

The UI does not advance until the outbox write succeeds. Review writes are serialized so IndexedDB read-modify-write operations cannot race. A failed write no longer poisons subsequent writes.

The local storage keys are currently:

```text
cards:{userId}
review_commits:{userId}
review_events:{userId}
session_history:{userId}
pending_sessions:{userId}
```

The local committed-event history is capped at 5,000 events. It is used for optimistic streak and goal projections. The outbox remains the durable synchronization source.

## Current server synchronization flow

```text
SyncService
  -> ReviewCommitSyncHandler
  -> POST /review/commits/batch
  -> ReviewCommitsController
  -> ReviewCommitsService transaction
       1. validate payload
       2. verify the card belongs to the authenticated user
       3. insert review_commits row with ON CONFLICT DO NOTHING
       4. atomically update cards.reviewState only when reviewedAt is newer
  -> remove only the successfully submitted event IDs from local outbox
```

Database representation:

```ts
CardEntity.reviewState: ReviewSchedulingState | null;
CardEntity.reviewStateUpdatedAt: Date | null;

ReviewCommitEntity {
  eventId: string;    // primary key
  attemptId: string;  // unique index
  reviewId: string;
  userId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  event: object;
  record: object;
  nextState: object;
}
```

The server accepts the client-computed schedule because offline review requires the client to remain authoritative for the action that already occurred. It validates structure and ownership, preserves the event history, and prevents stale state from replacing newer state.

## How cards currently get into a review session

There are two different paths.

### Path A: queue assembled before navigation

Used by the review hub, custom study, mastery, collection, vault, leech, and struggling-card pages.

```text
CardStore.cards()
  -> ReviewFilterService.buildQueue(filters)
  -> ReviewStore.startSession(queue, collectionId, name)
  -> ReviewStore.pendingQueue
  -> navigate to /review/player
  -> ReviewPage consumes pendingQueue
```

For the daily queue, `ReviewFilterService`:

1. starts with every card in `CardStore`;
2. optionally filters by collection;
3. filters by the requested five-stage set;
4. for `DUE_DATE`, keeps `isNew(card) || isDue(card, now)`;
5. sorts due cards by `reviewState.dueAt`, with new cards after due cards;
6. applies the daily-goal limit.

This is currently the only standard path that deliberately combines new and due cards.

### Path B: player assembles its own queue

Used when `/review/player` is opened without a pending queue.

```text
ReviewPage.ngOnInit()
  -> wait for first CardStore.isLoading === false
  -> inspect route query parameters
  -> retry mode: select explicit card IDs
  -> all mode: select every card
  -> default mode: use CardStore.dueCards()
```

`CardStore.dueCards()` is defined as:

```ts
cards().filter(card => isDue(card, now))
```

`isDue()` requires an existing non-manual `reviewState.dueAt`. New cards without `reviewState` are therefore excluded.

## Current no-data problem

### High-confidence integration defects

#### 1. Direct/default player entry excludes all new cards

If existing cards have no new `reviewState`—which is expected after deliberately discarding the old review data—then every card is classified as new. The default player fallback asks only for `CardStore.dueCards()`, producing an empty array.

This is especially visible immediately after the migration because old `srsState` data is ignored and no replacement state exists until a card receives its first new-system review.

#### 2. The player can observe the initial false loading state

`CardStore` initializes with:

```ts
isLoading: false
hasEverLoaded: false
cards: []
```

`loadCards()` first awaits the IndexedDB cache. It sets `isLoading: true` only after that await when no cache exists. `ReviewPage` subscribes to the first `isLoading === false` value and takes one emission. It can therefore run queue selection against the initial empty array before the cache or API load completes.

#### 3. Empty queues fail silently

The hub and several entry pages use:

```ts
if (!queue.length) return;
```

The player also remains empty when its fallback selection produces no cards. There is no diagnostic distinction among:

- cards are still loading;
- card loading failed;
- there are genuinely no cards;
- there are cards but none are currently due;
- new cards were excluded by the selected queue policy;
- a collection or card-ID filter matched nothing.

#### 4. Card loading errors are not exposed

`CardStore.loadCards()` catches an API failure and clears loading flags, but does not set `error`. The cache read occurs outside that error boundary. An empty store after an infrastructure failure is therefore indistinguishable from a user with no cards, and a rejected cache read can terminate the load task without a state transition.

### Data checks required before choosing a fix

Capture these values on an affected account:

```text
authenticated user ID
GET /cards response count
IndexedDB cards:{userId} count
CardStore.cards().length
CardStore.hasEverLoaded()
CardStore.isLoading()
CardStore.error()
count without reviewState
count by reviewState.stage
count with dueAt <= now
pendingQueue length before player navigation
player route and query parameters
player queue length after initialization
```

Also inspect one API card response to confirm that dates and `reviewState` are serialized as expected.

## Recommended next plan

### P0: restore deterministic card acquisition

1. Introduce an explicit card-load state, for example:

```ts
type CardLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };
```

2. Make card loading awaitable or expose a `ready` signal. Do not infer readiness from `isLoading === false`.
3. Make the review player consume one explicit session request instead of independently reconstructing a queue.
4. Define the default daily policy centrally: likely overdue cards first, then new cards up to the daily limit.
5. Render distinct loading, load-error, no-cards, and nothing-due states.
6. Add a behavioral test for a user whose cards all have `reviewState === undefined`.

### P1: use the reference session engine in the application

The current `ReviewPage` advances through an array index and does not use:

- `createReviewSession()`;
- `selectNextCard()`;
- `recordPresentation()`;
- `recordSessionReview()`;
- `skipSessionCard()`.

Plan a `ReviewSessionStore` or a focused session feature inside `ReviewStore` that owns the pure `ReviewSessionState`. The player should ask the store for the current presentation rather than owning queue/index progression itself. This is necessary for correct relearning interleaving and skip semantics.

### P1: establish one queue-policy contract

Proposed input:

```ts
interface ReviewSessionRequest {
  source:
    | { kind: 'daily' }
    | { kind: 'collection'; collectionId: string }
    | { kind: 'explicit'; cardIds: string[] }
    | { kind: 'new-only' }
    | { kind: 'struggling' }
    | { kind: 'custom'; filters: ReviewFilters };
  mode: 'typing' | 'recall';
  direction: 'source_to_target' | 'target_to_source' | 'mixed';
  limit: number;
}
```

One application-layer operation should resolve this request from a ready card repository/store and create the domain session. Route components should forward intent, not contain separate queue algorithms.

### P1: define new-card admission policy

Decisions still needed:

- Are all state-less cards immediately eligible?
- How many new cards may enter the daily queue?
- Is the new-card limit separate from the total daily goal?
- Should due cards always take priority over new cards?
- Should manually mastered cards be excluded from every automatic queue?
- Should a new card receive an explicit persisted `new` state at creation, or remain state-less until first review?

Recommendation: keep state-less as the canonical pristine-new representation, admit due cards first, then fill remaining daily capacity with new cards using a separately configurable maximum.

### P1: complete manual mastery and leech commands

The pure domain supports manual mastery and undo. The application does not yet synchronize those transitions as explicit commands/events. Leech reset/rest currently update local card state but are not represented as committed review events.

Define separate idempotent commands/events rather than pretending these actions are review ratings:

```text
CardManuallyMastered
ManualMasteryUndone
LeechRestScheduled
CardProgressReset
```

### P2: reconcile multi-device offline commits

The server currently chooses the state from the newest `reviewedAt`. That prevents stale overwrites but does not replay divergent offline histories from multiple devices. Decide whether MVP accepts last-reviewed-at state selection or whether the server must deterministically replay all events per card.

If replay is planned, record scheduler configuration/version on every commit so historical transitions remain reproducible.

### P2: improve observability

Add development diagnostics or structured logs for:

- card load source: cache, API, or offline cache;
- counts for all/new/due/manual-mastered;
- queue request and resulting count;
- local outbox count;
- accepted and duplicate commit counts;
- last successful synchronization time.

Do not log card content or answers unnecessarily.

## Suggested acceptance scenarios for the next iteration

1. A user with ten cards and no `reviewState` can start a daily session.
2. A direct player route cannot select cards before `CardStore` is ready.
3. A user with five overdue and ten new cards receives overdue cards first and a policy-bounded number of new cards.
4. A manually mastered card never appears in an automatic daily queue.
5. A failed card is re-presented according to the pure relearning session selector.
6. Reloading the application offline retains cards, pending commits, committed events, and session progress required by the chosen resume policy.
7. A local persistence failure prevents the player from advancing and exposes a recoverable UI error.
8. Repeated synchronization of the same attempt creates one server event and one state transition.
9. An older concurrent commit cannot replace a newer card state.
10. Card-load failure is displayed differently from a genuinely empty library.

## Verification status at handoff

Passed:

- mobile TypeScript compilation;
- API TypeScript build;
- Angular development build;
- 31 pure review-domain tests;
- 4 API commit-parser tests;
- legacy runtime-reference audit;
- `git diff --check`.

The full repository Jest suite has unrelated pre-existing failures, primarily empty API test suites and Angular component tests missing storage or translation providers. Mobile lint also has three existing issues unrelated to this review implementation.

## Primary implementation files

```text
libs/shared/domain/src/index.ts
apps/mobile/src/app/features/review/domain/review-domain.ts
apps/mobile/src/app/features/review/domain/review-persistence.ts
apps/mobile/src/app/features/review/store/review.store.ts
apps/mobile/src/app/features/review/services/review-filter.service.ts
apps/mobile/src/app/features/review/services/review-commit-api.service.ts
apps/mobile/src/app/features/review/services/review-commit-sync.handler.ts
apps/mobile/src/app/features/review/pages/review/review.page.ts
apps/mobile/src/app/features/vault/store/card.store.ts
apps/mobile/src/app/shared/srs/srs-status.ts
apps/mobile/src/app/shared/srs/review-stats.store.ts
apps/api/src/review/review-commit.entity.ts
apps/api/src/review/review-commit.parser.ts
apps/api/src/review/review-commits.service.ts
apps/api/src/review/review-commits.controller.ts
apps/api/src/cards/card.entity.ts
apps/api/src/cards/cards.service.ts
```

## Planning conclusion

The scheduler and offline commit mechanism are ready to serve as the foundation. The next design effort should not tune intervals first. It should define a single, explicit card-acquisition and session-lifecycle contract, then connect the existing pure session engine to the Angular store and player. That work is the shortest path to restoring review data while preserving the new architecture.
