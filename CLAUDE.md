# LinguaCard — Project Context for Claude

## What this is

A hybrid language learning app built with **Angular 21 + Ionic 8 + Capacitor 8**.
Targets: iOS, Android, and Progressive Web App (PWA) from one codebase.
Backend: NestJS (partially built, running in parallel with json-server during development).
Primary use case: German vocabulary learning. Architecture is language-agnostic via `LearningContext`.

---

## Monorepo layout

This is an **Nx monorepo**. All file paths use the full path from the repo root.

```
/                                        ← repo root
├── apps/
│   ├── mobile/                          ← Ionic / Angular app
│   │   └── src/
│   │       ├── app/                     ← Angular app root
│   │       ├── theme/                   ← Design system SCSS (_tokens, _utils, variables)
│   │       └── environments/
│   └── api/                             ← NestJS backend
│       └── src/
└── libs/
    └── shared/
        └── domain/                      ← Shared TypeScript types (all domain models)
            └── src/index.ts             ← Single barrel export
```

### Path alias — always use this for domain types

```typescript
// ✅ Correct — always import domain types this way
import { Card, CreateCardDto, MasteryLevel } from '@lingua-card/shared/domain';

// ❌ Wrong — never use a relative path to the lib
import { Card } from '../../../libs/shared/domain/src/index';

// ❌ Wrong — this file is being deleted
import { Card } from '../../../core/models/mock-data';
```

---

## Dev environment

```bash
# Terminal 1 — json-server mock API (port 3000)
npm run start-db

# Terminal 2 — Ionic app (port 4200 / 8100)
npm start          # or: ionic serve

# Terminal 3 — NestJS API (port 3001, optional)
npm run dev:api
```

Environment files:

```typescript
// apps/mobile/src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'   // json-server
};

// apps/mobile/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.linguacard.app'  // NestJS
};
```

Switching from json-server to NestJS requires **only** changing `environment.apiUrl`. Nothing else in the app changes.

---

## Feature-first architecture

The app follows a strict **three-layer dependency rule**:

```
features  →  shared  →  core  →  (Angular / Ionic / Capacitor)
```

**Features never import from other features.** Cross-feature data flows through Angular DI injection only.

```
apps/mobile/src/app/
│
├── core/                              ← Infrastructure only — no domain/feature logic
│   ├── interceptors/
│   │   ├── auth.interceptor.ts        ← Attaches Bearer JWT; handles 401
│   │   └── error.interceptor.ts       ← Global HTTP error → toast mapping
│   ├── guards/
│   │   └── auth.guard.ts
│   ├── services/
│   │   ├── auth.service.ts            ← Token lifecycle, session signals
│   │   ├── sync.service.ts            ← Generic queue orchestration (no domain types)
│   │   ├── local-data.service.ts      ← Raw IndexedDB get/set (no business logic)
│   │   ├── network.service.ts         ← Online/offline signal
│   │   └── theme.service.ts           ← Dark/light mode toggle
│   └── core.providers.ts
│
├── shared/                            ← Reusable UI + algorithms — no feature state
│   ├── ui/                            ← LDS design system components
│   │   ├── article-badge/             ← <lc-article-badge [article]="card.article">
│   │   ├── mastery-dot/               ← <lc-mastery-dot [level]="3">
│   │   ├── word-item/                 ← <lc-word-item [card]="card">
│   │   ├── button/                    ← <lc-button variant="filled-primary">
│   │   ├── category-chip/             ← <lc-category-chip [active]="true">
│   │   └── empty-state/               ← <lc-empty-state icon="📚" title="...">
│   ├── audio/
│   │   ├── audio.service.ts           ← TTS engine (platform capability, not feature logic)
│   │   └── audio-player/              ← <lc-audio-player> dumb playback button
│   ├── csv/
│   │   ├── csv-parser.service.ts      ← Pure parsing: string → ParsedRow[]
│   │   └── csv-import-ui/             ← Reusable import sheet (no vault knowledge)
│   ├── srs/
│   │   └── fsrs.service.ts            ← FSRS-5 algorithm wrapper — features call it, never re-implement
│   ├── components/                    ← Other shared components
│   │   ├── sync-status/               ← Synced / pending / error indicator
│   │   ├── fab-button/
│   │   └── user-menu/
│   └── pipes/
│       ├── article-class.pipe.ts
│       └── mastery-label.pipe.ts
│
└── features/                          ← One folder per feature, lazy-loaded
    ├── auth/                          ← Login, Register, Forgot password
    ├── onboarding/
    ├── home/                          ← Dashboard
    ├── vault/                         ← Cards + collections
    │   ├── pages/                     ← vault, word-detail, collections, collection-detail
    │   ├── components/                ← add-word-sheet, assign-collection-sheet, category-selector
    │   ├── store/
    │   │   ├── card.store.ts          ← CardStore (signalStore)
    │   │   ├── category.store.ts      ← CategoryStore (signalStore)
    │   │   └── collection.store.ts    ← CollectionStore (signalStore)
    │   ├── services/
    │   │   ├── card-api.service.ts
    │   │   ├── category-api.service.ts
    │   │   └── collection-api.service.ts
    │   └── import/                    ← CSV + image import sub-feature
    │       ├── pages/                 ← import, import-review, image-entry, image-processing, image-review
    │       └── services/
    ├── review/                        ← Flashcard study sessions
    │   ├── pages/                     ← review-hub, review, session-summary, custom-study, mastery-breakdown, session-history, struggling-cards
    │   ├── store/
    │   │   └── review.store.ts        ← ReviewStore (signalStore)
    │   └── services/
    ├── listen/                        ← Audio playlist
    │   ├── pages/
    │   ├── components/                ← playlist-source-sheet
    │   └── store/
    │       └── listen.store.ts        ← ListenStore (⚠ raw Injectable — see Tech Debt)
    ├── stories/                       ← AI-generated reading stories
    │   ├── pages/                     ← story-library, story-reader, story-complete
    │   ├── components/                ← generate-story-sheet
    │   ├── store/
    │   │   └── story.store.ts         ← StoryStore (signalStore)
    │   └── services/
    │       └── story-api.service.ts
    ├── ai/                            ← AI integrations (pronunciation, image parsing)
    └── progress/
```

### Decision tree — where does new code go?

```
Is this infrastructure any app needs (auth, HTTP, storage, network)?  → core/
Is this a UI component or algorithm used by 2+ features?              → shared/
Is this TTS / audio as a platform capability?                         → shared/audio/
Is this the FSRS / SRS algorithm?                                     → shared/srs/
Is this owned by exactly one feature?                                 → features/<name>/
Is this a store?                                                      → features/<name>/store/  (use signalStore)
Is this an HTTP service for one resource?                             → features/<name>/services/
```

---

## State management — always use signalStore

All feature state uses **ngrx/signals `signalStore()`**. Never create a new raw `@Injectable` with manual `signal()` fields for feature state.

```typescript
// features/vault/store/card.store.ts  ← canonical example
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';

export const CardStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ cards, filter }) => ({
    filteredCards: computed(() => { /* ... */ }),
  })),

  withMethods((store) => {
    const api = inject(CardApiService);
    return {
      loadCards: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true })),
          switchMap(() => api.getAll().pipe(
            tap(cards => patchState(store, { cards, isLoading: false })),
            catchError(() => { patchState(store, { isLoading: false }); return EMPTY; }),
          )),
        ),
      ),
    };
  }),

  withHooks({ onInit(store) { store.loadCards(); } }),
);
```

### Store ownership

| Store | Lives in | Who can inject it |
|---|---|---|
| `CardStore` | `vault/store/` | vault, review, listen, home |
| `CategoryStore` | `vault/store/` | vault, home |
| `CollectionStore` | `vault/store/` | vault, review |
| `ReviewStore` | `review/store/` | review only |
| `ListenStore` | `listen/store/` | listen only |
| `StoryStore` | `stories/store/` | stories only |

Cross-feature data sharing is via Angular DI injection, **never** via file imports across feature folder boundaries.

---

## Service pattern — follow this for every new service

```typescript
// features/vault/services/card-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card, CreateCardDto, UpdateCardDto } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CardApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/cards`;

  getAll(params?: CardQueryParams): Observable<Card[]> {
    return this.http.get<Card[]>(this.apiUrl, { params: { ...params } });
  }

  getById(id: string): Observable<Card> {
    return this.http.get<Card>(`${this.apiUrl}/${id}`);
  }

  create(dto: CreateCardDto): Observable<Card> {
    return this.http.post<Card>(this.apiUrl, dto);
  }

  update(id: string, dto: UpdateCardDto): Observable<Card> {
    return this.http.patch<Card>(`${this.apiUrl}/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
```

**Rules:**
- Use `inject()`, not constructor injection
- All fields are `private readonly`
- Suffix: `ApiService` (e.g. `CardApiService`, not `CardService`)
- Always typed generics — never `http.get<any>()`
- Always return `Observable<T>` — never subscribe inside a service
- DTOs for writes: `CreateCardDto` not `Partial<Card>`
- Query params as a typed interface, never `any`

---

## Interceptors

### `auth.interceptor.ts` (functional interceptor)
- Reads `AuthService.token()` signal and attaches `Authorization: Bearer <token>` to every outgoing request
- Intercepts 401 responses → calls `authService.logout()` → redirects to `/auth/login`

### `error.interceptor.ts`
- 401 → redirect to `/auth/login`
- 403 → show "Access denied" toast
- 404 → show "Not found" toast
- 500 → show "Server error, try again" toast
- Network error → show "You appear to be offline" toast

---

## API endpoints

NestJS API is prefixed at `/api/v1` (e.g. `http://localhost:3001/api/v1/cards`).
json-server runs at `http://localhost:3000` with no prefix.

| Resource | json-server | NestJS |
|---|---|---|
| Cards | `GET /cards` | `GET /api/v1/cards` |
| Card | `GET /cards/:id` | `GET /api/v1/cards/:id` |
| Create card | `POST /cards` | `POST /api/v1/cards` |
| Update card | `PATCH /cards/:id` | `PATCH /api/v1/cards/:id` |
| Delete card | `DELETE /cards/:id` | `DELETE /api/v1/cards/:id` |
| Collections | `GET /collections` | `GET /api/v1/collections` |
| Categories | `GET /categories` | `GET /api/v1/categories` |
| Auth login | `POST /auth/login` | `POST /api/v1/auth/login` |
| Auth register | `POST /auth/register` | `POST /api/v1/auth/register` |
| SRS states | `GET /srsStates` | `GET /api/v1/srs` |
| Review sessions | `GET /reviewSessions` | `GET /api/v1/review/sessions` |
| Stories | `GET /stories` | `GET /api/v1/stories` |
| Image import | — | `POST /api/v1/import/image` |

**json-server filtering:**
```
GET /cards?collectionId=col-001
GET /cards?_page=1&_limit=20
GET /cards?_sort=createdAt&_order=desc
```

---

## Design system (LDS)

> **Always read `.claude/skills/lds.md` before writing any component SCSS or creating any UI component.**

The LinguaCard Design System (LDS) is the single source of truth for all visual decisions. The skill file is the authoritative reference. The rules below are a summary — the skill file has the full detail.

### Hard rules — never violate

1. No raw hex values in any `.scss` file — use `t.$lc-*` SCSS token variables
2. No raw `px` for `font-size`, `padding`, `margin`, `gap`, `border-radius` — use `t.$lc-space-*` / `t.$lc-radius-*`
3. No raw `box-shadow` values — use `t.$lc-shadow-*`
4. No raw font family strings — use `t.$lc-font-body` or `t.$lc-font-display`
5. No feature-scoped button CSS — use `<lc-button>`
6. No feature-scoped article colour CSS — use `<lc-article-badge>`
7. No feature-scoped mastery colour CSS — use `<lc-mastery-dot>`
8. No `--ion-*` overrides in component files — use `apps/mobile/src/theme/_ionic-map.scss` only
9. No BEM class naming — flat, descriptive names only (Angular encapsulation handles scoping)

### SCSS import pattern (start every component `.scss` file with this)

```scss
@use '../../../../theme/tokens' as t;
@use '../../../../theme/utils' as u;
```

Adjust the relative depth (`../../../../`) to match the file's actual location.

### Article gender — always use the component

Never write article colour CSS. Never reference the old `.lc-article-badge--der` global classes.

| Article | Gender | Visual |
|---|---|---|
| `der` | Masculine | Blue tones |
| `die` | Feminine | Red tones |
| `das` | Neuter | Grey/brown tones |
| `null` | None (verbs / adj) | No badge rendered |

```html
<lc-article-badge [article]="card.article" />
```

### Mastery levels — always use the component

Never write mastery colour CSS. Never use `.lc-mastery-dot--*` global classes.

| Level | Label | Meaning |
|---|---|---|
| 0 | New | Never reviewed |
| 1 | Beginner | Barely recalled |
| 2 | Learning | Recalled with effort |
| 3 | Familiar | Good recall |
| 4 | Good | Easy recall |
| 5 | Mastered | Instant recall |

```html
<lc-mastery-dot [level]="card.srsState?.masteryLevel ?? 0" />
```

### LDS shared component catalogue

| Component | Selector | Key inputs |
|---|---|---|
| `ArticleBadgeComponent` | `<lc-article-badge>` | `article: ArticleType` |
| `MasteryDotComponent` | `<lc-mastery-dot>` | `level: MasteryLevel` |
| `WordItemComponent` | `<lc-word-item>` | `card`, `showMastery`, `showAudio`, `interactive` |
| `ButtonComponent` | `<lc-button>` | `variant`, `size`, `disabled`, `loading`, `fullWidth` |
| `CategoryChipComponent` | `<lc-category-chip>` | `label`, `count?`, `active`; output: `chipClick` |
| `EmptyStateComponent` | `<lc-empty-state>` | `icon`, `title`, `subtitle`; slot: `[action]` |

---

## Tests — skip for now

**Do not write any test files (`.spec.ts`) for this project.** The `@types/jest` types are not configured in `apps/api/tsconfig.json`, so spec files cause TypeScript build failures on Render. Tests will be re-enabled in a dedicated story once the tsconfig is fixed.

- Do not create `*.spec.ts` files
- Do not add test scaffolding, mocks, or test utilities
- If a ticket asks for tests, skip the test step and note it as deferred

---

## Angular rules (always follow)

> **Always read `.claude/skills/angular.md` before writing or editing any Angular component, directive, pipe, or service.**

1. **`ChangeDetectionStrategy.OnPush`** — every component, no exceptions
2. **Standalone components only** — do NOT set `standalone: true` in the decorator (it is the default in Angular 19+; setting it is redundant)
3. **`input()` signals** for new component inputs, not `@Input()` decorators
4. **`output()` function** for outputs, not `@Output()` / `EventEmitter`
5. **`inject()`** for dependencies, not constructor injection
6. **Host bindings in `host` object** — never use `@HostBinding` / `@HostListener`
7. **Native control flow** — `@if`, `@for`, `@switch`; never `*ngIf`, `*ngFor`, `*ngSwitch`
8. **`class` / `style` bindings** — never `ngClass` or `ngStyle`
9. **Lazy-load every feature** — `loadComponent` / `loadChildren` in routes
10. **Never use `any`** — every HTTP call has a typed generic
11. **Never subscribe in a service** — return `Observable<T>`, let stores/components subscribe
12. **Never hardcode a language** — everything through `LearningContext` interface
13. **Offline-first** — writes go to local store first; `SyncService` handles server sync
14. **DTOs for writes** — `CreateCardDto` not `Partial<Card>` for POST/PATCH
15. **Never import from `mock-data.ts`** — use `@lingua-card/shared/domain`
16. **Never hardcode a URL** — always use `environment.apiUrl`

---

## SRS algorithm (FSRS-5)

Rating 1–4 maps to: Again / Hard / Good / Easy.

- Implemented via `ts-fsrs` npm package (v5.4.1)
- `computeFSRS(state, rating)` and `previewFsrsIntervals(state)` live in `libs/shared/utils/src/index.ts`
- **`FsrsService`** in `shared/srs/fsrs.service.ts` wraps those pure functions — features inject this service, they never call `ts-fsrs` directly
- SRS state stored per card in `srsState` field of the `Card` entity
- `nextDueAt` is indexed for due-card queries
- `stability` (days), `difficulty`, `retrievability` (0–1 float) are stored and displayed in word detail
- Mastery level derived from stability thresholds: 0=New, 1=Learning (<7d), 2=Familiar (7–30d), 3=Review (30–90d), 4=Good (90–180d), 5=Mastered (≥180d)
- `MAX_INTERVAL_DAYS = 365`, `TARGET_RETENTION = 0.9`

---

## Epics & feature status

| # | Name | Status | Key files / epics |
|---|---|---|---|
| 1 | Vocabulary Vault | ✅ Implemented | `vault/`, `review/` |
| 2 | Listen & Learn | ✅ Implemented | `listen/`, `shared/audio/` |
| 3 | AI Stories | ✅ Implemented | `stories/` |
| 4 | Image Import | 🔄 In progress | `vault/import/`, `apps/mobile/epic-image-import.md` |
| 5 | Offline First | 🔄 In progress | `core/sync/`, `apps/mobile/epic-offline-first.md` |
| 6 | Architecture Refactor | 🔄 In progress | `apps/mobile/architecture-redesign-plan.md` |
| 7 | Design System (LDS) | 📋 Planned | `apps/mobile/epic-design-system.md`, `.claude/skills/lds.md` |
| 8 | Story Reader Redesign | 📋 Planned | `apps/mobile/story-ready-update-epic.md` |
| 9 | Fill the Gap (Cloze) | 📋 Planned | — |
| 10 | Progress Dashboard | 📋 Planned | — |
| 11 | Community Decks | 📋 Planned | — |
| 12 | Subscription & Paywall | ✅ Implemented | `features/subscription/`, `apps/api/src/subscriptions/`, `apps/mobile/epic-subscription-paywall.md` |
| 13 | Tiered AI Routing | ✅ Implemented | `apps/api/src/stories/`, `apps/api/src/import/word-enrich.service.ts`, `apps/mobile/epic-tiered-ai-routing.md` |
| 14 | FSRS Migration | ✅ Implemented | `shared/srs/fsrs.service.ts`, `libs/shared/utils/`, `apps/mobile/epics/epic-fsrs-migration.md` |

### Implemented page inventory

**Vault:** vault list, word detail, collections, collection detail, add-word sheet, assign-collection sheet, category selector, CSV import, image import (in progress)

**Review:** review hub, flashcard player, session summary, custom study, mastery breakdown, session history, struggling cards

**Listen:** listen player, playlist source sheet

**Stories:** story library, generate story sheet, story reader (German + translation + grammar + keywords tabs), story complete

**Auth:** login, register, forgot password, reset-data sheet

**Shared:** home/dashboard, onboarding, user menu, sync-status indicator, fab button

---

## AI provider routing (current production config)

| Task | Adapter | Model | Config env var |
|---|---|---|---|
| Image extraction (Phase 1) | `GeminiAdapter` | `gemini-2.5-flash` (direct) | `GEMINI_API_KEY` |
| Image extraction (legacy single-pass) | `OpenRouterAdapter` | `google/gemma-4-26b-a4b-it:free` | `OPENROUTER_API_KEY` |
| Word enrichment | `OpenRouterAdapter` | `anthropic/claude-haiku-4-5` | `ENRICHMENT_MODEL` |
| Story — Pro tier | `OpenRouterAdapter` | `anthropic/claude-sonnet-4-6` | `STORY_MODEL_PRO` |
| Story — Free tier | `OpenRouterAdapter` | `google/gemini-2.5-flash` | `STORY_MODEL_FREE` |
| TTS (word audio) | `GoogleCloudTtsAdapter` | `de-DE-Wavenet-B` | `GOOGLE_CLOUD_TTS_*` |
| Whisper timestamps | `GroqWhisperAdapter` | `whisper-large-v3-turbo` | `GROQ_API_KEY` |

Tier routing in `StoryGenerationService` is live — resolved per-request via `SubscriptionService.getStatusForUser()`. Pro users get Claude Sonnet 4.6; free users get Gemini 2.5 Flash. See `apps/mobile/epic-subscription-paywall.md`.

---

## Tech debt register

These are **known deviations** from the architecture. Do not "fix" them without a dedicated story — silent refactors break things mid-migration.

| Item | Current state | Target state | Tracking |
|---|---|---|---|
| `ListenStore` | Raw `@Injectable` with manual `signal()` fields | `signalStore()` | Architecture refactor epic |
| `mock-data.ts` | Still imported in some older components (e.g. `add-word-sheet`) | Deleted; all types from `@lingua-card/shared/domain` | Architecture refactor epic |
| `SyncService.execute()` | Partially still uses a `switch` on operation type strings | Generic handler registry (LC-100) | Offline First epic |
| Article badge global CSS | `.lc-article-badge--*` classes still in `variables.scss` | `<lc-article-badge>` component only (DS-04) | LDS epic |
| `variables.scss` | Mix of raw values and CSS custom properties | Fully driven by `_tokens.scss` (DS-01) | LDS epic |
| `UserMenuComponent` | Uses `@Output()` and `@Input()` decorators | Migrate to `input()` / `output()` signals | Architecture refactor epic |
| `SRSStateData.easeFactor` / `.repetitions` | Legacy SM-2 fields kept for DB schema compat, no longer computed | Remove columns once DB migration is confirmed clean | FSRS migration epic |

---

## Documentation map

| File | Purpose |
|---|---|
| `CLAUDE.md` | This file — always read first |
| `.claude/skills/lds.md` | Design system rules — read before any UI work |
| `libs/shared/domain/src/index.ts` | All domain types — single source of truth |
| `db.json` | json-server mock data — shape of all API resources |
| `apps/mobile/src/theme/variables.scss` | CSS custom properties (runtime token layer) |
| `apps/mobile/src/theme/_tokens.scss` | SCSS source tokens — added by DS-01 |
| `apps/mobile/architecture-redesign-plan.md` | Feature-first architecture spec and migration plan |
| `apps/mobile/epic-offline-first.md` | Offline First epic — LC-100 to LC-115 |
| `apps/mobile/epic-image-import.md` | Image Import epic — LC-080 to LC-093 |
| `apps/mobile/epic-design-system.md` | LDS epic — DS-01 to DS-17 |
| `apps/mobile/story-ready-update-epic.md` | Story Reader Redesign epic |
| `apps/mobile/epic-subscription-paywall.md` | Subscription & Paywall epic — LC-103 to LC-118 |
| `design-reference.html` | Visual design spec — open in browser before building any screen |
| `apps/api/src/` | NestJS backend source |
