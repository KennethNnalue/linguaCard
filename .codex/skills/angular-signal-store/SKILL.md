---
name: angular-signal-store
description: >
  Angular architecture, Signals, RxJS, and NgRx Signal Store implementation and
  review rules. Use whenever creating, modifying, refactoring, testing, or
  reviewing Angular frontend code or NgRx Signal Store features.
---

# Angular + NgRx Signal Store

Use together with `application-architecture`.

This project uses modern Angular and **NgRx Signal Store** as the preferred feature-state architecture.

---

# 1. Angular Layer Model

Angular features should normally contain four conceptual responsibilities:

```text
Container / Route Component
        ↓
Feature Signal Store
        ↓
Business / Domain Service
        ↓
Technical / API Service
```

Presentational components sit beneath the container:

```text
Container Component
        ↓ inputs
Presentational Component
        ↑ outputs
```

Not every feature requires every layer.

Create only layers that have a real responsibility.

---

# 2. Component Classification

Every component must be classified before implementation.

## Container / Smart Component

Responsible for:

- connecting feature state to the template
- reading Signal Store state
- invoking Signal Store operations
- routing/navigation
- translating UI events into feature commands
- composing presentational components

A container may inject:

- feature Signal Store
- Router
- ActivatedRoute
- UI infrastructure genuinely belonging to the container

Do not put business rules in a container.

Do not perform HTTP orchestration directly inside a container.

---

## Presentational / Dumb Component

Responsible only for presentation and user interaction.

Use:

- `input()`
- `output()`
- `model()` when two-way interaction is genuinely part of the component API
- `computed()` for purely derived local presentation state

Presentational components must not inject:

- Signal Store
- NgRx Store
- business services
- HTTP/API services

Infrastructure services used solely for presentation may be acceptable when unavoidable, but prefer explicit inputs when practical.

Use:

```ts
changeDetection: ChangeDetectionStrategy.OnPush
```

unless a documented framework constraint makes it inappropriate.

---

# 3. Split Components by Responsibility

Split a component when it combines:

- feature orchestration
- substantial rendering behavior

Example:

```text
review-page.component
├── review-card.component
├── review-progress.component
└── review-answer-input.component
```

The page/container coordinates the feature.

Children render state and emit intent.

Do not split tiny markup simply to satisfy an arbitrary file-size rule.

---

# 4. Signal Store Is the Feature Facade

NgRx Signal Store is the preferred state boundary.

A dedicated facade class is **not required** merely to hide Signal Store.

Container components may inject the feature store directly:

```ts
private readonly reviewStore = inject(ReviewStore);
```

This is acceptable because the Signal Store itself is the feature-facing state API.

Do not inject the global NgRx `Store` directly into components for feature orchestration.

If legacy global NgRx state must be consumed, isolate it behind an appropriate feature boundary rather than scattering selectors and dispatches through components.

---

# 5. Signal Store API Design

Expose intent-oriented methods.

Prefer:

```ts
reviewStore.startSession();
reviewStore.submitAnswer(answer);
reviewStore.markCurrentCardAsMastered();
```

over generic setters:

```ts
reviewStore.setCurrentCard(card);
reviewStore.setStatus('loading');
```

The UI should express **what happened**, not manually orchestrate state mutations.

---

# 6. State Shape

Store canonical state only.

Do not store values that can be deterministically derived.

Bad:

```ts
type ReviewState = {
  cards: ReviewCard[];
  reviewedCards: ReviewCard[];
  reviewedCardCount: number;
};
```

when `reviewedCardCount` can be computed.

Prefer:

```ts
withComputed(({ reviewedCards }) => ({
  reviewedCardCount: computed(() => reviewedCards().length),
}))
```

Derived state belongs in:

- `computed`
- `withComputed`

not duplicated state fields.

---

# 7. Signal Rules

Use `signal` for owned mutable state.

Use `computed` for derived state.

Use `effect` for genuine side effects.

---

## Never use `effect()` to synchronize derived state

Bad:

```ts
const firstName = signal('');
const lastName = signal('');
const fullName = signal('');

effect(() => {
  fullName.set(`${firstName()} ${lastName()}`);
});
```

Correct:

```ts
const fullName = computed(() => `${firstName()} ${lastName()}`);
```

Using `effect()` to copy one signal into another creates duplicate state and synchronization risk.

---

## Legitimate effects

Effects are appropriate for actual side effects such as:

- analytics
- browser APIs
- persistence
- logging
- imperative third-party libraries
- synchronizing with external systems

They may also capture state intentionally when the captured value must survive beyond the lifetime or change of its original source.

Example:

A redirect parameter must be persisted before authentication changes the source route state.

That is captured state, not derived state.

---

# 8. Do Not Mutate Signal Values

Never mutate objects or arrays obtained from signals.

Bad:

```ts
store.cards().push(card);
```

Bad:

```ts
const card = store.currentCard();
card.status = 'mastered';
```

Use immutable updates.

---

# 9. Updating Signal Store State

Use `patchState` for state mutation inside the store.

Keep state transitions understandable and atomic where practical.

Example:

```ts
patchState(store, {
  status: 'loading',
  error: null,
});
```

Prefer domain-oriented helpers when transitions become non-trivial.

Do not spread complicated business rules across several `patchState` calls in UI code.

---

# 10. Business Logic Placement

Signal Store may orchestrate a workflow.

Domain/business calculations should live in a business service or pure domain functions when substantial.

Example:

The store may:

1. receive `submitAnswer`
2. call the review evaluator
3. call persistence
4. update state

The store should not contain a 100-line spaced-repetition algorithm.

Prefer:

```text
ReviewStore
    ↓
ReviewSchedulingService
```

where `ReviewSchedulingService` contains scheduling rules.

---

# 11. Technical Services

Technical services wrap infrastructure.

Examples:

- HTTP API
- local storage
- browser speech API
- IndexedDB
- WebSocket
- analytics SDK

Example:

```text
ReviewStore
    ↓
ReviewService
    ↓
ReviewApiService
```

Where:

- `ReviewService` contains application/domain behavior when needed
- `ReviewApiService` handles HTTP

Do not combine them merely because both classes would initially be small.

---

# 12. Async Signal Store Operations

Prefer NgRx Signal Store mechanisms such as `rxMethod` for observable workflows.

Example pattern:

```ts
const loadCards = rxMethod<LoadCardsRequest>(
  pipe(
    distinctUntilChanged(),
    switchMap(request =>
      reviewApi.getCards(request).pipe(
        tapResponse({
          next: cards => {
            patchState(store, {
              cards,
              status: 'success',
              error: null,
            });
          },
          error: error => {
            patchState(store, {
              status: 'error',
              error: mapReviewError(error),
            });
          },
        }),
      ),
    ),
  ),
);
```

The exact mechanism may differ according to the existing feature architecture.

Follow established project patterns when they remain correct.

---

# 13. Choose RxJS Flattening Operators by Semantics

Do not choose operators mechanically.

## `switchMap`

Use when only the newest request matters.

Examples:

- search
- filtering
- route-driven loading
- live validation
- autocomplete

Older requests should be cancelled or ignored.

---

## `concatMap`

Use when every operation must complete in order.

Examples:

- ordered writes
- sequential persistence
- operations where ordering changes the outcome

---

## `exhaustMap`

Use when a new trigger should be ignored while the current operation is running.

Examples:

- preventing duplicate submit
- login action
- start-session command

Use only when dropping repeated triggers is actually desired.

---

## `mergeMap`

Use when operations may safely execute concurrently and ordering does not matter.

Do not use it for state-changing operations where older responses can overwrite newer state.

---

# 14. Mutation Requests Must Not Be Accidentally Cancelled

Do not use `switchMap` for an operation that must complete after being initiated.

Examples:

- create
- delete
- payment
- persistent save
- irreversible mutation

Choose `concatMap`, `exhaustMap`, or another strategy based on the intended concurrency behavior.

---

# 15. Loading and Error State

Every asynchronous operation that exposes loading state must define:

- initial state
- loading transition
- success transition
- failure transition

Never leave:

```ts
isLoading: true
```

after a failed request.

Prefer state models that make illegal combinations difficult.

Example:

```ts
type RequestStatus = 'idle' | 'loading' | 'success' | 'error';
```

For substantially different states, prefer discriminated state models.

---

# 16. Stale Response Protection

Be explicit about whether stale requests may complete.

Example:

When route parameter `documentId` changes:

```text
document A request starts
document B becomes active
document A returns
```

The response for document A must not overwrite document B state.

Use request cancellation, request identity, or another mechanism appropriate to the operation.

This is especially important for route-driven feature stores.

---

# 17. Store Lifetime

Determine whether a store is:

- application-wide
- route-scoped
- feature-scoped
- component-scoped

Do not accidentally make feature state global.

When feature state should reset as the user leaves a route, prefer appropriate scoped providers.

When state must survive navigation, choose a broader lifetime deliberately.

---

# 18. Reset Behavior

Define reset semantics for feature stores when context changes.

Examples:

- document ID changes
- project changes
- review session ends
- user logs out

Do not allow state belonging to entity A to remain visible when entity B becomes active.

This includes:

- data
- loading status
- errors
- selection
- pagination
- empty state
- transient UI state when context-specific

---

# 19. Inputs and Outputs

Use signal-based Angular APIs for new code when consistent with the project version.

Prefer:

```ts
readonly card = input.required<ReviewCard>();
readonly answerSubmitted = output<string>();
```

Avoid unnecessary setters around inputs.

Do not copy an input into another signal unless you intentionally need independent mutable state.

Derived input state should normally be computed.

---

# 20. `model()`

Use `model()` when the component legitimately owns a two-way binding contract.

Do not use `model()` as a replacement for every input/output pair.

Use it when parent and child conceptually share an editable value.

---

# 21. Template Logic

Templates should remain declarative.

Acceptable:

```html
@if (store.isLoading()) { ... }
```

Avoid:

- complicated expressions
- business calculations
- repeated expensive function calls
- methods that mutate state
- methods whose output changes unpredictably
- nested conditions that hide domain decisions

Extract complex presentation state into computed signals.

Extract domain logic into the appropriate business layer.

---

# 22. Template Performance

Do not call expensive transformation functions directly from templates.

Bad:

```html
<div>{{ calculateComplexProgress(cards()) }}</div>
```

Prefer:

```ts
readonly progress = computed(() =>
  calculateProgress(this.cards())
);
```

Do not prematurely optimize trivial expressions.

---

# 23. Subscriptions in Components

Prefer:

- signals
- `toSignal`
- `AsyncPipe`
- Signal Store

If a component must explicitly subscribe, it must have correct lifecycle cleanup.

Use:

```ts
takeUntilDestroyed()
```

unless the observable is guaranteed to synchronously complete and that behavior is obvious.

A long-lived component subscription without lifecycle cleanup is a critical defect.

---

# 24. `toSignal`

Use `toSignal` to bridge an observable into signal-based presentation when appropriate.

Provide a meaningful initial value when required.

Do not repeatedly convert the same observable to multiple signals.

Do not use `toSignal` merely to avoid designing proper feature state.

---

# 25. RxJS Side Effects

Use `tap` only for actual side effects.

Do not perform transformations in `tap`.

Bad:

```ts
tap(response => response.items = response.items.filter(...))
```

Transform using `map`.

---

# 26. Avoid Nested Subscriptions

Never write:

```ts
source$.subscribe(value => {
  other$(value).subscribe(...);
});
```

Compose streams using flattening operators.

---

# 27. Routing

Route parsing and navigation belong in the container/application boundary, not presentational components.

Avoid passing `ActivatedRoute` into domain services.

If route data determines store loading, the container or route-scoped feature integration should translate route state into a store command.

---

# 28. Angular DI

Prefer:

```ts
private readonly service = inject(MyService);
```

when consistent with the existing application.

Dependencies should communicate architectural responsibility.

If a presentational component requires five unrelated services, reevaluate its classification.

---

# 29. NgRx Signal Store Composition

Use store features to group coherent state behavior when complexity warrants it.

Potential structure:

```text
review.store.ts
review.state.ts
review.models.ts
review.selectors/computed.ts
review.methods.ts
```

Do not split Signal Store code across files mechanically.

Extract reusable Signal Store features only when multiple stores genuinely share the behavior or a complex concern deserves isolation.

---

# 30. Entity State

Use entity-oriented utilities when they materially simplify:

- normalization
- updates
- lookup
- removal
- identity management

Do not normalize small collections without a concrete benefit.

---

# 31. Keep Server State and UI State Distinct

Examples of server/domain state:

- cards
- users
- documents
- persisted review session

Examples of transient UI state:

- active accordion
- local tab
- temporary dialog visibility
- input focus

Do not automatically put every UI detail into feature state.

Store UI state when it must coordinate across components or survive lifecycle boundaries.

Keep genuinely local presentation state local.

---

# 32. Angular Testing

Use Jest.

Prefer behavioral tests.

For components, test through:

- rendered DOM
- public inputs
- public outputs
- user events

Avoid testing private methods.

---

# 33. Presentational Component Tests

Test:

- rendering from inputs
- emitted outputs
- conditional presentation
- relevant user interaction

Do not mock stores because presentational components must not depend on them.

---

# 34. Container Tests

Mock the feature boundary rather than deep implementation details.

When using legacy NgRx Store code, use:

```ts
provideMockStore()
```

Never:

```ts
jest.mock('@ngrx/store')
```

For Signal Stores, use the project's established provider/testing strategy and control observable dependencies at their source.

Do not mock RxJS operators.

---

# 35. Time-Based Tests

Use RxJS `TestScheduler` for operators such as:

- debounceTime
- delay
- timer
- throttleTime
- auditTime

Prefer deterministic virtual time over real timers.

Where the existing test architecture uses `flush()`, keep assertions outside subscriptions when practical.

---

# 36. Angular Critical Rules

Treat these as critical defects when reviewing project code:

- `any` in production code
- unsafe `as` used to silence incorrect typing
- `require(...)`
- `lodash` instead of `lodash-es`
- `rxjs/operators`
- forbidden Nx cross-scope import
- component long-lived `.subscribe()` without lifecycle cleanup
- `effect()` duplicating derived signal state
- API/business orchestration directly inside a component
- global NgRx `Store` dispatch directly from a component instead of the established feature state boundary
- presentational component directly depending on a feature store or business service

Direct injection of an **NgRx Signal Store into its container component is allowed and expected**.

Do not flag that as a facade violation.

---

# 37. Angular Review Checklist

When reviewing changed Angular code, check in this order:

## Correctness

- stale state
- incorrect reset behavior
- race condition
- async ordering
- null handling
- error state
- wrong entity displayed

## Signals

- duplicated state
- incorrect effect
- signal mutation
- unnecessary signal copy
- invalid computed dependency

## Signal Store

- inappropriate state ownership
- incorrect store lifetime
- async concurrency semantics
- missing error transition
- stale response
- business logic in wrong layer

## Components

- smart/dumb boundary
- service injection
- side effects
- template complexity
- lifecycle cleanup

## RxJS

- wrong flattening operator
- nested subscriptions
- missing cancellation semantics
- leaked subscription
- side effects in transformation chains

## Performance

- repeated calculations
- expensive template methods
- redundant subscriptions
- duplicate requests

## Tests

- regression paths
- loading/error transitions
- stale response scenarios
- input/output behavior
- state reset when feature context changes

Do not report weak stylistic suggestions.

---

# 38. Preferred Angular Feature Shape

Use this as guidance, not a mandatory file structure.

```text
feature/
├── containers/
│   └── review-page/
├── components/
│   ├── review-card/
│   └── review-progress/
├── state/
│   └── review.store.ts
├── services/
│   └── review.service.ts
├── data-access/
│   └── review-api.service.ts
└── models/
    └── review.models.ts
```

Only create directories that add real architectural meaning.

---

# 39. Final Decision Rule

When deciding where Angular code belongs:

Ask:

**Is this rendering?**
→ component.

**Is this local derived presentation state?**
→ computed signal.

**Is this feature state or workflow orchestration?**
→ Signal Store.

**Is this a business rule?**
→ business/domain service or pure domain function.

**Is this HTTP, storage, browser API, or SDK integration?**
→ technical/data-access service.

If a piece of code answers more than one of these questions, split the responsibility.
