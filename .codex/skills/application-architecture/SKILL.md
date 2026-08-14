---
name: application-architecture
description: >
  Shared architecture, TypeScript quality, implementation, refactoring, testing,
  and code-review rules for Angular and NestJS applications. Use whenever
  creating, modifying, refactoring, or reviewing application code.
---

# Application Architecture

Use this skill for all application work.

Framework-specific rules are defined in:

- `angular-signal-store` for Angular and NgRx Signal Store code.
- `nestjs-backend` for NestJS backend code.

The rules in this skill apply to both frontend and backend unless a framework-specific skill overrides them.

---

# 1. Core Engineering Principles

Optimize for:

1. correctness
2. maintainability
3. explicit architecture
4. strong typing
5. testability
6. readability
7. simplicity

Do not optimize primarily for fewer files or fewer lines of code.

A small class with the wrong responsibility is worse than two small classes with clear responsibilities.

Prefer boring, explicit code over clever abstractions.

---

# 2. Understand Context Before Changing Code

Before implementing or reviewing a change, identify:

- affected layers
- change type
- dependencies involved
- state boundaries
- external side effects
- asynchronous flows
- likely regression areas

Classify the change as one of:

- feature
- bugfix
- refactor
- infrastructure
- test-only change

Do not invent missing behavior.

Do not assume undocumented requirements.

If existing code establishes a clear convention, follow it unless the task explicitly requires changing that convention.

When implementing a task and some detail is ambiguous but does not prevent safe implementation, choose the smallest behavior consistent with the surrounding code.

When ambiguity materially affects product behavior or data correctness, surface the ambiguity rather than inventing a business rule.

---

# 3. Read Direct Dependencies Before Editing

For every file being changed, inspect its directly relevant dependencies.

Examples:

- component injects a store → inspect that feature store
- component renders a child component → inspect its public inputs/outputs when relevant
- store calls a service → inspect that service contract
- service calls an API client → inspect that client method
- controller calls an application service → inspect that service
- service uses a repository → inspect the repository contract
- return type changes → inspect direct consumers

Depth limit:

Read directly referenced dependencies required to understand the behavior.

Do not recursively explore unrelated dependencies.

Do not modify unrelated files merely because you notice something that could be improved.

---

# 4. Responsibility Boundaries

Every class, function, service, store, controller, or component should have a clearly identifiable responsibility.

Before writing code, classify it.

## UI

Responsible for:

- displaying state
- collecting user interaction
- forwarding user intent

Not responsible for:

- business rules
- API orchestration
- domain transformations
- persistence logic

## State/Application Layer

Responsible for:

- feature state
- application workflows
- coordinating asynchronous operations
- translating user intent into business/application operations
- exposing UI-ready feature state when appropriate

## Business/Domain Layer

Responsible for:

- domain rules
- calculations
- validation rules
- transformations
- decisions based on business state

Business logic must remain independent from UI or transport concerns whenever practical.

## Infrastructure Layer

Responsible for:

- HTTP
- database access
- browser APIs
- local storage
- filesystem
- queues
- third-party SDKs
- external services

Infrastructure concerns must not be mixed with business rules merely because the implementation is small.

---

# 5. Split Rule

Split code when one unit performs multiple distinct responsibilities.

Examples:

Split a component when it simultaneously:

- orchestrates state
- contains substantial presentation logic

Split a service when it simultaneously:

- implements business decisions
- performs infrastructure operations

Split a method when:

- its steps represent independent domain operations
- naming the extracted operations makes the workflow clearer
- testing one part requires exercising unrelated behavior

Do not split merely to reduce line count.

Do not create wrappers that add no semantic value.

---

# 6. Naming and Self-Documenting Code

Names must communicate intent and outcome.

Prefer:

```ts
loadAvailableProjects()
```

over:

```ts
load()
```

Prefer:

```ts
hasReachedDailyReviewGoal
```

over:

```ts
isDone
```

Prefer:

```ts
removeExpiredSessions()
```

over:

```ts
cleanup()
```

A reader should not need a comment to understand what a method or property represents.

If a comment explains what code does, rename or restructure the code instead.

---

# 7. Comments Policy

Default to no comments.

Comments are allowed only when they explain **why** something non-obvious exists, such as:

- business constraint
- external system limitation
- compatibility workaround
- deliberately unusual implementation
- non-obvious performance tradeoff

Do not write comments that narrate implementation.

Bad:

```ts
// Filter active users
const activeUsers = users.filter(user => user.isActive);
```

Good, when genuinely necessary:

```ts
// The provider may resend the same webhook for up to 24 hours,
// so processing must remain idempotent.
```

Before adding a comment, ask:

1. Can naming remove the need?
2. Can restructuring remove the need?
3. Is responsibility mixed?
4. Is the comment explaining why rather than what?

Several explanatory comments inside one class are an architecture smell.

---

# 8. TypeScript Hard Rules

These rules apply to production code unless explicitly stated otherwise.

## Never use `any`

Do not write:

```ts
function mapResponse(value: any) {}
```

Use:

- concrete interfaces
- generics
- `unknown` with narrowing
- discriminated unions

---

## Do not silence errors with type assertions

Avoid:

```ts
value as SomeType
```

Do not use assertions to bypass incorrect types.

Prefer:

- proper function signatures
- runtime type guards
- typed factories
- discriminated unions
- schema validation
- generic constraints

A type assertion is acceptable only when required at a trusted framework boundary that cannot be represented correctly otherwise and the safety is independently guaranteed.

It must never be the default fix for a TypeScript error.

---

## Do not use `require`

Use ES imports.

Bad:

```ts
const config = require('./config');
```

Good:

```ts
import { config } from './config';
```

---

## Do not use `forEach`

Prefer:

```ts
for (const item of items) {
  processItem(item);
}
```

Use array operators such as `map`, `filter`, `some`, `every`, or `reduce` when returning a derived value.

---

## Do not import `lodash`

Use `lodash-es` when a utility is genuinely needed.

Prefer native JavaScript APIs when they are equally clear.

---

## RxJS imports

Import operators from:

```ts
import { map, switchMap } from 'rxjs';
```

Never:

```ts
import { map } from 'rxjs/operators';
```

---

# 9. Type Design

Prefer domain-specific types over primitive leakage.

Avoid APIs such as:

```ts
updateStatus(id: string, status: string)
```

when the status has a finite domain.

Prefer:

```ts
type ReviewStatus = 'new' | 'learning' | 'review' | 'mastered';

updateStatus(cardId: CardId, status: ReviewStatus)
```

Use discriminated unions for state that has mutually exclusive variants.

Prefer:

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApplicationError };
```

over combinations of unrelated booleans when illegal states become possible.

---

# 10. Functions and Methods

Functions should operate at one conceptual level.

Prefer guard clauses over deeply nested conditions.

Good:

```ts
function canStartReview(session: ReviewSession): boolean {
  if (session.cards.length === 0) {
    return false;
  }

  if (session.isCompleted) {
    return false;
  }

  return true;
}
```

Avoid boolean parameters whose meaning is unclear at the call site.

Bad:

```ts
loadCards(true, false);
```

Prefer an options object or separate operations.

---

# 11. Async and Side Effects

Explicitly identify side effects.

Examples:

- HTTP request
- database mutation
- filesystem operation
- navigation
- analytics
- local storage
- timer
- browser listener
- queue publication

Do not hide significant side effects inside utility functions.

Do not start asynchronous work without handling:

- success
- failure
- cancellation where applicable
- cleanup where applicable

Never swallow errors silently.

---

# 12. Error Handling

Errors should be handled at the layer capable of making a meaningful decision.

Do not catch errors simply to rethrow the same error.

Bad:

```ts
try {
  return await save();
} catch (error) {
  throw error;
}
```

Catch errors when you need to:

- map infrastructure errors to application/domain errors
- add context
- recover
- perform required cleanup
- translate transport behavior

Do not expose database, SDK, or infrastructure-specific errors directly across architectural boundaries unless that is an explicit contract.

---

# 13. Avoid Premature Abstraction

Do not introduce abstractions based only on the possibility that something might be reused later.

Create an abstraction when:

- multiple concrete consumers already need the same behavior
- a domain concept deserves an explicit boundary
- infrastructure must be replaceable/testable
- complexity is materially reduced

Three similar lines are often better than an inappropriate generic abstraction.

DRY does not mean eliminating every repeated token.

---

# 14. Dependency Direction

Dependencies should generally flow toward domain/application concepts rather than infrastructure details.

UI should not know database implementation details.

Domain rules should not know HTTP response structures.

Controllers should not know ORM query syntax.

Presentational components should not know state implementation details.

Whenever an infrastructure contract enters the application, translate it at an appropriate boundary if the external structure should not become part of the domain model.

---

# 15. Testing Principles

Tests document externally observable behavior.

Prefer:

```text
should keep the previous selection when loading the next page fails
```

over:

```text
should call method
```

Tests should focus on:

- user-visible behavior
- public APIs
- state transitions
- domain outcomes
- integration contracts

Avoid testing private methods.

Do not access private properties through casting or bracket notation.

---

# 16. Test Hard Rules

## Do not inspect Jest call arrays

Never:

```ts
mock.calls[0][0]
```

Use:

```ts
expect(service.save).toHaveBeenCalledWith(expectedValue);
```

or:

```ts
expect(service.save).toHaveBeenNthCalledWith(1, expectedValue);
```

---

## Do not fabricate types with double assertions

Never:

```ts
value as unknown as User
```

Create a properly typed fixture.

Example:

```ts
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Test User',
    ...overrides,
  };
}
```

Where spreading `Partial<T>` cannot preserve an invariant safely, create explicit fixture parameters instead.

---

## Do not test private implementation

Bad:

```ts
component['updateState']();
```

Test through:

- public method
- input
- output
- template interaction
- observable state
- exposed store API

---

## Async tests must prove completion

Do not create subscriptions that may emit after the test finishes.

Prefer:

- Angular `fakeAsync`
- RxJS `TestScheduler`
- `firstValueFrom`
- awaited promises
- deterministic signal/store assertions

When testing time-based RxJS behavior, prefer `TestScheduler`.

---

# 17. Test Isolation

Each test must be independently executable.

Do not share mutable state across tests.

Factories should return new objects.

Mocks should be reset or recreated appropriately.

A test must not rely on execution order.

---

# 18. Implementation Workflow

When implementing a change:

1. understand existing architecture
2. identify affected boundary
3. inspect direct dependencies
4. define or confirm domain types
5. place logic in the correct layer
6. implement the smallest complete behavior
7. handle failure paths
8. add or update focused tests
9. run relevant tests
10. run TypeScript checks
11. run lint
12. inspect the final diff for unintended changes

Do not perform unrelated cleanup unless required for the requested change.

---

# 19. Review Workflow

When performing a code review, analyze in this exact order.

## Phase 1 — Core Correctness

Check:

- incorrect logic
- missing cases
- null/undefined behavior
- invalid state transitions
- race conditions
- ordering bugs
- incorrect error handling
- data corruption possibilities

---

## Phase 2 — Framework-Specific Correctness

Apply the relevant framework skill.

For Angular:

- signals
- NgRx Signal Store
- RxJS
- component boundaries
- change detection

For NestJS:

- controller/service boundaries
- DTO validation
- providers
- persistence
- transactions
- authorization
- exception mapping

---

## Phase 3 — Architecture

Check:

- responsibility boundaries
- SOLID violations with actual consequences
- inappropriate coupling
- domain/infrastructure leakage
- unnecessary abstractions
- missing architectural boundaries

Do not report theoretical SOLID violations without a concrete impact.

---

## Phase 4 — Performance and Lifecycle

Check:

- memory leaks
- unnecessary subscriptions
- redundant calculations
- duplicate API calls
- repeated database queries
- N+1 operations
- expensive work in hot paths
- unbounded collections
- forgotten timers/listeners/resources

---

## Phase 5 — Type Safety

Check:

- `any`
- unsafe assertions
- incorrect nullability
- weak public APIs
- invalid state representation
- inconsistent models

---

## Phase 6 — Testing

Check:

- missing regression scenario
- missing failure behavior
- weak assertions
- implementation-detail tests
- nondeterministic async tests
- shared mutable fixtures

---

# 20. Review Filtering

Before reporting a finding, ask:

1. Is it provable from the changed code and direct context?
2. Can it cause incorrect behavior, architectural degradation, or a meaningful maintenance problem?
3. Is there a concrete fix?
4. Is it already guaranteed by the compiler or lint configuration?

Do not report:

- formatting
- subjective naming preferences
- stylistic preferences without measurable impact
- compiler errors as review discoveries
- ESLint violations already deterministically enforced
- speculative future problems
- generic advice
- unrelated issues in unchanged code

Exception:

Project hard rules explicitly designated as review-critical should still be surfaced when the review workflow requires them, even when tooling also catches them.

---

# 21. Review Severity

Use:

## 🔴 Critical

Use when the issue:

- breaks behavior
- can corrupt data
- creates security exposure
- violates a project hard rule
- causes guaranteed resource leakage
- creates invalid architectural behavior explicitly prohibited by project rules

## 🟡 Risk

Use when:

- production behavior may fail under realistic conditions
- state becomes inconsistent
- asynchronous behavior is unsafe
- maintainability is materially degraded
- architectural coupling will make the feature unsafe to evolve

## 🟢 Improvement

Use only when there is:

- a clear measurable benefit
- a concrete implementation
- meaningful reduction in complexity or duplication

Do not fill review output with improvements.

## ❓ Question

Use when correctness depends on information not visible in the change.

Do not disguise uncertainty as a bug.

## 🧪 Suggested Test

Use for a specific missing regression or edge-case scenario.

---

# 22. Review Deduplication

Report the root cause once.

If one problem affects several locations, reference the affected locations in the same finding.

Do not report multiple symptoms of the same defect as separate issues.

---

# 23. Default Review Output

Start with:

```md
## Context loaded
- diff: <branch>...<HEAD>
- related files read: [...]
- change type: feature | refactor | bugfix | infrastructure | test
- risk zones: [...]
```

List only files actually inspected.

Never invent filenames.

Then include only sections containing findings.

```md
### 🔴 Critical issues

**[file:line]** — <problem and impact>

```ts
<problematic code>
```

Fix:

```ts
<minimal corrected code>
```

Confidence: High
```

Use equivalent sections for:

- 🟡 Risks
- 🟢 Improvements
- ❓ Questions
- 🧪 Suggested tests

If there are no findings:

```text
No critical issues found.
```

Do not pad the response.

---

# 24. GitLab MR Mode

When invoked with `--mr`, omit the context header.

Each finding must be independently usable as a GitLab comment.

Format:

````md
**🔴 Critical** — `file.ts:42`

**Problem:** concise description.

**Impact:** concrete production consequence.

```ts
<exact problematic code>
```

**Fix:**

```ts
<minimal correction>
```

**Confidence:** High
````

Separate findings using:

```md
---
```

---

# 25. Confidence

## High

The defect is provable directly from code.

## Medium

The issue is strongly indicated but depends on direct context.

## Low

Do not normally report it as an issue.

Convert low-confidence correctness concerns into a specific question instead.

---

# 26. Completion Standard

A change is complete only when:

- responsibilities are placed in the correct layers
- types represent the domain accurately
- happy paths work
- meaningful failure paths work
- asynchronous behavior is deterministic
- resource cleanup is correct
- relevant tests exist
- no unrelated behavior was changed
- code communicates intent without explanatory narration

When choosing between clever code and obvious code, choose obvious code.
