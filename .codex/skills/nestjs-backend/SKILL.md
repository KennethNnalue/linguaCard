---
name: nestjs-backend
description: >
  NestJS backend architecture, API, domain logic, persistence, validation,
  security, testing, and code-review rules. Use whenever creating, modifying,
  refactoring, testing, or reviewing NestJS backend code.
---

# NestJS Backend

Use together with `application-architecture`.

The goal is a backend where transport, application logic, domain rules, and infrastructure remain clearly separated.

---

# 1. Preferred Architecture

Use this conceptual direction:

```text
Controller
    ↓
Application / Business Service
    ↓
Repository or Technical Service
    ↓
Database / External API / Infrastructure
```

For complex domains:

```text
Controller
    ↓
Application Service / Use Case
    ↓
Domain Services / Domain Objects
    ↓
Repository Interfaces
    ↓
Infrastructure Implementations
```

Do not introduce full domain-driven architecture for simple CRUD unless the complexity justifies it.

---

# 2. Controllers Are Transport Adapters

Controllers should handle HTTP concerns.

They may:

- bind route parameters
- accept DTOs
- read authenticated user context
- call an application service
- return the result

Controllers must not contain substantial:

- business rules
- database queries
- entity transformations
- transaction orchestration
- authorization decisions beyond transport-level guard/decorator integration

Bad:

```ts
@Post()
async create(@Body() dto: CreateOrderDto) {
  const user = await this.userRepository.find(dto.userId);

  if (user.balance < dto.total) {
    throw new BadRequestException();
  }

  user.balance -= dto.total;
  await this.userRepository.save(user);

  return this.orderRepository.create(dto);
}
```

Move the workflow into an application/business service.

---

# 3. Application Services

Application services coordinate use cases.

Examples:

- create order
- finish review session
- invite project member
- reset password
- mark card as mastered

They may coordinate:

- repositories
- domain services
- external services
- transactions
- event publication

Application services should expose intent-oriented methods.

Prefer:

```ts
completeReviewSession(command)
```

over:

```ts
updateSession(data)
```

when the operation has business meaning.

---

# 4. Domain / Business Services

Place reusable business rules here.

Examples:

- review scheduling
- pricing calculations
- permissions derived from domain state
- mastery calculation
- eligibility checks
- scoring
- status transitions

Business services should avoid depending directly on:

- Nest HTTP decorators
- request/response objects
- ORM-specific query syntax
- third-party SDK response structures

Prefer pure functions when state or injected dependencies are unnecessary.

---

# 5. Technical Services

Technical services wrap infrastructure.

Examples:

```text
EmailService
StorageService
PaymentGateway
SpeechProvider
SearchClient
ExternalDictionaryApi
```

They should expose application-friendly contracts rather than leaking SDK details where practical.

---

# 6. Repository Boundary

Persistence operations should be encapsulated when direct ORM usage would otherwise leak through the application.

Repositories are especially valuable when:

- queries are non-trivial
- several services need the same persistence behavior
- transactions span multiple operations
- ORM models should not become domain models
- persistence implementation may change
- business tests should not depend on ORM behavior

Avoid ceremonial repository wrappers that merely rename every ORM method without adding architectural value.

---

# 7. DTOs Are Transport Contracts

DTOs represent API input/output contracts.

They are not automatically domain entities.

Input DTOs should validate externally supplied data.

Example:

```ts
export class CreateReviewDto {
  @IsUUID()
  cardId!: string;

  @IsString()
  @MinLength(1)
  answer!: string;
}
```

Use the project's configured validation mechanism consistently.

---

# 8. Validate at the Boundary

Never rely solely on TypeScript types for runtime input validation.

Validate:

- HTTP bodies
- query parameters
- path parameters where appropriate
- webhook payloads
- external messages
- queue payloads
- untrusted third-party responses when needed

TypeScript disappears at runtime.

---

# 9. Domain Validation Is Different From DTO Validation

DTO validation asks:

> Is this structurally valid input?

Domain validation asks:

> Is this operation allowed?

Example:

DTO:

```text
rating must be between 1 and 4
```

Domain:

```text
a completed review session cannot accept another answer
```

Do not place domain rules solely in DTO decorators.

---

# 10. Do Not Trust Client-Supplied Ownership or Authorization State

Do not accept values such as:

```text
isAdmin
ownerId
canEdit
subscriptionActive
```

as authoritative merely because the client submits them.

Resolve authorization-sensitive state from authenticated server-side context.

---

# 11. Authorization

Authentication identifies the caller.

Authorization determines whether the caller may perform the operation.

Keep these concepts separate.

Use:

- guards
- policies
- authorization services
- domain ownership checks

as appropriate.

Do not scatter complex role checks across controller methods.

---

# 12. Persistence and Transactions

Operations that must succeed or fail atomically should use a transaction.

Typical examples:

- balance update + payment record
- parent entity + dependent records
- mastery transition + history record
- session completion + reward update

Do not introduce transactions around read-only or unrelated operations unnecessarily.

The transaction boundary should normally correspond to a business operation.

---

# 13. Avoid Partial State Changes

Consider:

```text
update card
insert history
award experience
```

If the business rule requires all three to happen together, partial persistence is a correctness bug.

Use the database's transactional capabilities through the appropriate infrastructure/application boundary.

---

# 14. External Calls and Transactions

Avoid holding database transactions open while waiting for slow external systems unless consistency requirements make that unavoidable.

Prefer patterns such as:

- persist intent
- commit
- publish event/job
- process external operation
- persist result

For high-reliability cross-system workflows, consider an outbox or equivalent pattern when justified.

Do not introduce distributed-systems machinery without a real requirement.

---

# 15. Idempotency

Identify operations that may be repeated.

Examples:

- webhook handling
- payment callbacks
- retrying jobs
- client retries
- import processing

When duplicate processing could create incorrect state, design the operation to be idempotent.

---

# 16. Error Boundaries

Infrastructure-specific failures should normally be translated before reaching API consumers.

Do not leak:

- raw ORM errors
- SQL errors
- SDK internals
- database constraint text

Map them to application errors and appropriate HTTP exceptions at a controlled boundary.

---

# 17. HTTP Exceptions

Do not use `InternalServerErrorException` for known domain outcomes.

Map semantics appropriately:

- malformed input → 400
- unauthenticated → 401
- unauthorized → 403
- missing resource → 404
- conflicting state → 409
- validation failure → project-specific 400/422 convention

Follow the project's established API contract.

---

# 18. Do Not Catch Every Error

Bad:

```ts
try {
  return await this.service.execute();
} catch {
  throw new InternalServerErrorException();
}
```

This destroys useful semantics.

Catch only when you can meaningfully:

- translate
- recover
- enrich context
- compensate
- ensure required cleanup

Allow global exception handling to handle unexpected failures according to project conventions.

---

# 19. Logging

Logs should provide operational context without exposing secrets.

Useful context includes:

- operation
- stable entity identifier
- correlation/request identifier
- failure category

Never log:

- passwords
- access tokens
- refresh tokens
- full authorization headers
- secret keys
- sensitive payloads unnecessarily

Do not log the same exception repeatedly at every layer.

---

# 20. Configuration

Access environment configuration through the established configuration boundary.

Do not scatter:

```ts
process.env.SOME_VALUE
```

through business services.

Prefer typed configuration.

Validate required configuration during startup.

Fail early for missing critical configuration.

---

# 21. Dependency Injection

Use Nest providers for meaningful dependencies.

Do not use service locators or manually instantiate injected services.

Bad:

```ts
const service = new PaymentService();
```

when `PaymentService` has application dependencies.

Use constructor injection or the project's preferred Nest injection style.

---

# 22. Circular Dependencies

Do not normalize `forwardRef()` as an architecture technique.

A circular dependency usually signals:

- mixed responsibilities
- incorrect domain boundaries
- services knowing too much about each other

Restructure first.

Use `forwardRef()` only when a genuine architectural cycle cannot reasonably be eliminated.

---

# 23. Modules

Modules should represent coherent capabilities.

Avoid:

- giant shared modules exporting everything
- feature modules depending cyclically on each other
- infrastructure providers globally exposed without need

Prefer explicit exports.

Do not make providers global merely to avoid importing the correct module.

---

# 24. Entity and API Model Separation

Do not automatically return ORM entities from controllers.

Reasons include:

- accidental exposure of internal columns
- leaking persistence representation
- lazy relationship serialization
- unstable public API
- sensitive fields

Use explicit response models or mapping where the persistence shape should not define the API contract.

---

# 25. Mapping

Keep mapping explicit enough to understand.

Do not create generic reflection-based mapping infrastructure merely to remove straightforward field assignments.

A dedicated mapper is appropriate when:

- mapping is substantial
- multiple consumers share it
- persistence and domain models differ meaningfully

---

# 26. Database Queries

Watch for:

- N+1 queries
- loading entire tables unnecessarily
- fetching unused relations
- missing pagination
- repeated identical queries
- application-side filtering that belongs in the database

Do not optimize queries without evidence when the simple query is already bounded and clear.

---

# 27. Pagination

List endpoints expected to grow should have bounded retrieval.

Use the project's established:

- offset pagination
- cursor pagination

Do not invent a second pagination convention inside the same API without a reason.

Validate page size limits.

---

# 28. Concurrency

Do not assume a read-followed-by-write sequence is safe under concurrent requests.

Example:

```text
read balance = 10
request A subtracts 7
request B subtracts 7
```

Both requests may pass a naive application-level check.

For concurrency-sensitive operations use appropriate:

- transactions
- row locks
- atomic updates
- optimistic concurrency/versioning
- unique constraints

depending on the invariant.

---

# 29. Database Constraints Are Part of Correctness

Business invariants that can be enforced safely at the database layer should often have corresponding constraints.

Examples:

- uniqueness
- non-null fields
- foreign keys
- valid relationship ownership

Application validation alone does not protect against races or alternate writers.

---

# 30. External API Integrations

Wrap third-party clients behind a technical service.

Do not spread vendor response models through the application.

Handle:

- timeout
- transport failure
- unexpected response
- retries when safe
- rate limits where relevant

Retries must respect operation semantics.

Do not retry non-idempotent mutations blindly.

---

# 31. Background Jobs

Job handlers should be idempotent when retries are possible.

Do not assume exactly-once execution unless the infrastructure genuinely guarantees it.

Separate:

- job transport concerns
- business operation

A queue processor should normally delegate domain/application behavior rather than contain all business logic itself.

---

# 32. Events

Use events when meaningful decoupling is required.

Good use cases:

- analytics
- notification after committed business operation
- asynchronous integration
- independent follow-up processing

Do not use events to hide a straightforward synchronous dependency.

Events make execution flow less explicit and should provide real value.

---

# 33. TypeScript Rules

Apply all shared TypeScript hard rules.

In particular:

- no `any`
- no unsafe assertions
- no `require`
- no weak unvalidated external payloads
- use `unknown` at truly unknown boundaries and narrow it

Do not type errors as `any`.

---

# 34. Nullable Values

Model nullability accurately.

Do not write:

```ts
async findUser(id: string): Promise<User>
```

if absence is a legitimate outcome.

Use:

```ts
Promise<User | null>
```

or an application-level result contract.

Consumers must explicitly handle absence.

---

# 35. API Method Naming

Use domain intent.

Prefer:

```ts
findActiveSubscriptionForUser()
```

over:

```ts
getData()
```

Prefer:

```ts
markCardAsMastered()
```

over:

```ts
updateCard()
```

when the operation enforces specific domain behavior.

---

# 36. NestJS Testing Strategy

Use Jest.

Test at the narrowest layer that proves the behavior.

## Domain/business unit tests

Test:

- business rules
- state transitions
- calculations
- validation behavior

Avoid Nest TestBed when plain class construction is sufficient.

---

## Application service tests

Mock infrastructure boundaries.

Test:

- orchestration
- failure handling
- transaction semantics where practical
- calls triggered by domain outcomes

Do not mock private methods.

---

## Controller tests

Focus on:

- transport mapping
- DTO interaction where relevant
- delegation
- response contract

Do not duplicate all business tests at controller level.

---

## Integration tests

Use when behavior depends materially on:

- database constraints
- ORM mapping
- transactions
- authorization pipeline
- serialization
- Nest middleware/guards/interceptors

---

## End-to-end tests

Reserve for critical flows.

Examples:

- authentication
- permission boundaries
- multi-step business workflows
- public API contracts

Do not attempt to prove every service branch through E2E tests.

---

# 37. Test Fixtures

Use typed factories.

Example:

```ts
function createReviewSession(
  overrides: Partial<ReviewSession> = {},
): ReviewSession {
  return {
    id: 'session-1',
    status: 'active',
    reviewedCardCount: 0,
    ...overrides,
  };
}
```

If arbitrary partial overrides can create invalid domain entities, prefer explicit fixture parameters or specialized factories.

Never use:

```ts
{} as ReviewSession
```

or:

```ts
{} as unknown as ReviewSession
```

to bypass required fields.

---

# 38. Mocking

Mock boundaries, not implementation details.

Good boundaries:

- repository
- external API client
- message publisher
- clock
- random identifier generator when deterministic behavior matters

Avoid mocking:

- internal helper functions
- RxJS operators
- private methods

Tests should survive internal refactoring when behavior remains unchanged.

---

# 39. Time

Business logic depending on the current time should be testable.

For substantial time-dependent domain rules, prefer a clock/time abstraction rather than scattering direct `new Date()` calls.

Do not introduce a clock abstraction for incidental logging timestamps unless it provides test value.

---

# 40. IDs and Randomness

When generated IDs materially affect business behavior or deterministic testing, isolate generation behind an appropriate boundary.

Do not over-abstract harmless framework-generated identifiers.

---

# 41. Security Review

For changed endpoints check:

- authentication
- authorization
- ownership
- validation
- mass assignment
- sensitive response fields
- injection exposure
- unsafe file handling
- insecure external URL use
- secret leakage
- rate-sensitive operations when relevant

Do not report generic security speculation without a concrete path.

---

# 42. Mass Assignment

Never persist arbitrary DTO objects directly when doing so allows callers to control fields they should not own.

Risky:

```ts
repository.save(dto);
```

when the entity also contains fields such as:

```text
role
ownerId
isVerified
createdBy
subscriptionStatus
```

Map writable fields explicitly.

---

# 43. File Operations

For uploaded files validate as relevant:

- size
- allowed content type
- actual content when security-sensitive
- filename handling
- storage location

Never trust user-provided paths.

Prevent path traversal.

---

# 44. NestJS Critical Rules

Treat these as critical during review when applicable:

- `any` in production
- unsafe assertion used to silence incorrect typing
- `require(...)`
- business workflow implemented directly in controller
- authorization-sensitive operation trusts client-provided ownership/role state
- missing transaction where partial persistence violates a clear invariant
- raw infrastructure error exposing sensitive/internal details
- unsafe mass assignment enabling protected-field modification
- SQL/query construction vulnerable to injection
- guaranteed resource leak
- secret/token exposure

Do not assign Critical simply because architecture differs from personal preference.

---

# 45. NestJS Review Checklist

Analyze changed backend code in this order.

## Correctness

- domain rule
- missing/null state
- race condition
- partial update
- error semantics
- duplicate processing
- invalid transition

## HTTP boundary

- DTO validation
- response shape
- status semantics
- authentication
- authorization

## Service boundaries

- controller business logic
- infrastructure leaking into domain
- duplicated business rules
- incorrect responsibility

## Persistence

- transaction
- concurrency
- constraints
- N+1
- unbounded query
- invalid ownership query

## External systems

- error handling
- timeout
- idempotency
- retry safety
- vendor model leakage

## Types

- `any`
- assertion
- incorrect nullability
- weak API contracts

## Testing

- domain regression
- failure scenario
- permission boundary
- transaction/concurrency case
- external service failure
- validation case

Only report concrete issues.

---

# 46. Preferred Feature Shape

Use as guidance rather than a mandatory structure.

```text
reviews/
├── reviews.module.ts
├── controllers/
│   └── reviews.controller.ts
├── services/
│   ├── reviews.service.ts
│   └── review-scheduling.service.ts
├── repositories/
│   └── reviews.repository.ts
├── dto/
│   ├── create-review.dto.ts
│   └── review-response.dto.ts
├── models/
│   └── review.model.ts
└── tests/
```

For simple features, fewer files are appropriate.

For complex domains, application/domain/infrastructure subdirectories may be clearer.

Structure should reflect responsibility, not ceremony.

---

# 47. Final Placement Rule

When deciding where NestJS code belongs:

**Is this parsing or responding to HTTP?**
→ controller/transport layer.

**Is this coordinating a user/business operation?**
→ application service.

**Is this deciding business behavior?**
→ domain/business service or domain model.

**Is this talking to the database?**
→ repository/data-access layer.

**Is this talking to an external service?**
→ technical/infrastructure service.

**Is this validating untrusted transport input?**
→ DTO/boundary validation.

**Is this determining whether an authenticated actor may perform a business action?**
→ authorization policy/service/guard plus domain ownership checks as appropriate.

If one class answers several of these questions, reevaluate its responsibilities.

### A few deliberate changes from your original rules

The biggest change is the **Signal Store rule**. With classic NgRx, forcing components through a facade makes sense because otherwise components become coupled to actions/selectors. With NgRx Signal Store, the feature store can already expose a deliberately designed facade-like API such as `submitAnswer()`, `loadSession()`, and computed state. Adding another `ReviewFacade → ReviewStore` layer by default would often just create ceremony.

I also softened the blanket rule that "`switchMap` for mutations is always wrong." The actual rule should be based on **operation semantics**: `switchMap` is wrong when cancelling an already-started mutation is undesirable, while `concatMap`, `exhaustMap`, or `mergeMap` each have different correct use cases. This gives Codex a decision framework instead of a lookup table it may apply blindly.

Similarly, I would not make every lint-detectable issue both “filter it because lint catches it” and “always report it as critical.” Those two rules conflict. The shared skill resolves that by saying normal lint findings should not create review noise, while **explicit project hard rules may still be surfaced during review** if that is the behavior you want from Codex.

The resulting architecture should generally look like:

```text
Angular

Route / Smart Component
        │
        ▼
NgRx Signal Store
        │
        ├────────────► Business Service
        │                    │
        ▼                    ▼
Technical/API Service    Pure Domain Logic


NestJS

Controller
    │
    ▼
Application Service
    │
    ├────────────► Domain / Business Service
    │
    ▼
Repository / Technical Service
    │
    ▼
Database / External Systems
```

This gives Codex sufficiently strict rules to stop architecture drift without forcing unnecessary layers into every small feature.