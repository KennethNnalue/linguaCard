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
│   │   ├── theme.service.ts           ← Dark/light mode toggle
│   │   └── language.service.ts        ← UI language (i18n) — mirrors ThemeService pattern
│   ├── i18n/
│   │   └── supported-languages.ts     ← Registry of 6 supported UI languages
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
│   │   ├── word-audio.service.ts      ← Unified HD audio engine for all word/example/keyword/quiz pronunciation (no Web Speech)
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
    │   ├── pages/                     ← vault, word-detail, collections, collection-detail, platform-collection-detail, explore-topic
    │   ├── components/                ← add-word-sheet, assign-collection-sheet, category-selector
    │   ├── store/
    │   │   ├── card.store.ts          ← CardStore (signalStore)
    │   │   ├── category.store.ts      ← CategoryStore (signalStore)
    │   │   ├── collection.store.ts    ← CollectionStore (signalStore)
    │   │   └── platform-collection.store.ts  ← PlatformCollectionStore (signalStore)
    │   ├── services/
    │   │   ├── card-api.service.ts
    │   │   ├── category-api.service.ts
    │   │   ├── collection-api.service.ts
    │   │   └── platform-collection-api.service.ts
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
    │       ├── story-api.service.ts
    │       └── platform-story-api.service.ts     ← platform story API (LC-310)
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
| `PlatformCollectionStore` | `vault/store/` | vault collections page, platform-collection-detail page, explore-topic page |
| `ReviewStore` | `review/store/` | review only |
| `ListenStore` | `listen/store/` | listen only |
| `StoryStore` | `stories/store/` | stories only |
| `SettingsStore` | `settings/store/` | home, settings, `ReviewStatsStore` (for `dailyGoal`) |
| `ReviewStatsStore` | `shared/srs/` | home (streak/progress display); depends on `SettingsStore` for goal threshold |
| `OnboardingStore` | `onboarding/store/` | onboarding flow only; reuses `SettingsStore`, `PlatformCollectionStore`, `CardStore` |
| `ShareStore` | `sharing/store/` | sharing (notifications page), tabs (badge count) |

**Dictionary service (not a store — stateless API wrapper):**

| Service | Lives in | Who can inject it |
|---|---|---|
| `DictionaryApiService` | `vault/services/` | vault import-review, add-word sheet |
| `PlatformCollectionApiService` | `vault/services/` | `PlatformCollectionStore` only |
| `AdminApiService` | `features/admin/services/` | admin import page only |

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
| Dictionary lookup | — | `POST /api/v1/word-dictionary/lookup` |
| Dictionary batch lookup | — | `POST /api/v1/word-dictionary/batch-lookup` |
| Dictionary stats (admin) | — | `GET /api/v1/word-dictionary/stats` |
| Admin: import collection | — | `POST /api/v1/admin/platform-collections/import` |
| Admin: import story | — | `POST /api/v1/admin/platform-stories/import` (story JSON carries `nativeLang`, optional `quizQuestions`/`grammarNotes`) |
| Admin: re-enrich story audio | — | `POST /api/v1/admin/platform-stories/:id/generate-audio` → `AdminImportStoryResult` (retry TTS for a story imported without audio) |
| Admin: list platform collections | — | `GET /api/v1/admin/platform-collections` |
| Admin: publish toggle | — | `PATCH /api/v1/admin/platform-collections/:id/publish` (body: `AdminPublishToggleDto`) |
| Admin: set story category | — | `PATCH /api/v1/admin/platform-collections/:id/story-category` (body: `AdminSetStoryCategoryDto`) |
| Platform collections list | — | `GET /api/v1/platform-collections` → `PlatformCollectionListResponse` (auth required) |
| Platform collection detail | — | `GET /api/v1/platform-collections/:id` → `PlatformCollectionDetail` (auth required) |
| Adopt platform collection | — | `POST /api/v1/platform-collections/:id/adopt` → `AdoptPlatformCollectionResult` (auth required; idempotent) |
| Platform stories list | — | `GET /api/v1/platform-stories?nativeLang=&level=&category=` → `{ stories: PlatformStoryCard[]; total }` (each card has `adoptionStatus`/`adoptedStoryId`; auth required) |
| Platform story detail | — | `GET /api/v1/platform-stories/:id` → `PlatformStory` (auth required) |
| Adopt platform story | — | `POST /api/v1/platform-stories/:id/adopt` → `AdoptPlatformStoryResult` (auth required; idempotent — copies into the user's `stories` table with `sourcePlatformStoryId`) |
| Create share | — | `POST /api/v1/shares` (body: `CreateShareDto`) → `ShareRecord` (auth required) |
| Pending shares | — | `GET /api/v1/shares/pending` → `ShareNotificationList` (auth required) |
| Pending count | — | `GET /api/v1/shares/pending/count` → `{ count }` (auth required) |
| Respond to share | — | `POST /api/v1/shares/:id/respond` (body: `RespondToShareDto`) → `ShareRecord` (auth required) |
| Sent shares | — | `GET /api/v1/shares/sent` → `ShareRecord[]` (auth required) |
| Cancel share | — | `DELETE /api/v1/shares/:id` (auth required; sender only, pending only) |
| Sync status | — | `GET /api/v1/shares/sync-links/:resourceId/status` → `{ synced }` (auth required) |
| Unsync | — | `PATCH /api/v1/shares/sync-links/:resourceId/unsync` → `{ unsynced }` (auth required) |

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
@use 'theme/tokens' as t;
@use 'theme/utils' as u;
```

The build has `includePaths` configured, so use the short form `'theme/tokens'` — no relative depth needed.

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
| `LanguagePickerComponent` | `<lc-language-picker>` | (none — self-contained dropdown, uses `LanguageService`) |

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

## Internationalization (i18n)

The app uses **ngx-translate** (`@ngx-translate/core` + `@ngx-translate/http-loader`) for UI internationalization. Six languages are supported: English, Spanish, Turkish, Ukrainian, Russian, and Arabic.

### How it works

- **`LanguageService`** (`core/services/language.service.ts`) mirrors `ThemeService` — persists to `localStorage['lc-ui-language']`, sets `<html lang>` + `<html dir>`, calls `translateService.use()`.
- **`SUPPORTED_LANGUAGES`** registry at `core/i18n/supported-languages.ts` — single source of truth for language codes, native names, flags, and RTL direction.
- Translation JSON bundles live at `apps/mobile/src/assets/i18n/{en,es,tr,uk,ru,ar}.json` (715 keys each).
- `provideTranslateService({ fallbackLang: 'en' })` registered in `main.ts`.
- Server persists `uiLanguage` on `user_settings` table (default `'en'`); reconciled on app load.

### Rules for new UI strings

1. **Never hardcode English text** in templates — use `{{ 'key.path' | translate }}` or `[attr]="'key.path' | translate"`
2. **Key convention:** `feature.context.key` (e.g. `auth.login.signIn`, `home.streak.label`, `common.cancel`)
3. **Every component using the translate pipe** must import `TranslatePipe` from `@ngx-translate/core` in its `imports` array
4. **Programmatic strings** (toasts, alerts): inject `TranslateService`, use `this.translate.instant('key')` or `.get('key')`
5. **Dynamic values:** use ngx-translate interpolation — `{{ 'key' | translate:{ count: value } }}` with `{{count}}` in the JSON
6. **Add new keys to all 6 bundles** — `en.json` first, then the 5 translations. Run key-parity check.
7. **Shared/repeated strings** live under `common.*` namespace

### i18n in attribute bindings

```html
<!-- Template text -->
{{ 'auth.login.signIn' | translate }}

<!-- Placeholder -->
[placeholder]="'common.placeholder.email' | translate"

<!-- aria-label -->
[attr.aria-label]="'common.aria.close' | translate"

<!-- title -->
[title]="'stories.keywords.playPronunciationTitle' | translate"

<!-- Dynamic interpolation -->
{{ 'listen.hero.queueCountLabel' | translate:{ count: queueCount() } }}
```

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
| 15 | Story Studio 2.0 | 🔄 In progress | `features/stories/`, `apps/mobile/epics/epic-story-studio-redesign.md`, `apps/mobile/epics/epic-story-studio-redesign-design.html` |
| 16 | Streak, Goals & Web Reminders | ✅ Implemented | `apps/api/src/{settings,stats,push}/`, `features/settings/`, `shared/srs/review-stats.store.ts`, `apps/mobile/epics/epic-streak-goals-reminders.md` |
| 17 | Global Word Dictionary & Admin | ✅ Implemented | `apps/api/src/word-dictionary/`, `apps/api/src/admin/`, `features/admin/`, `vault/services/dictionary-api.service.ts`, `apps/mobile/epics/epic-global-word-dictionary.md` |
| 18 | Platform Vocabulary Collections | ✅ Implemented | `apps/api/src/platform-collections/`, `vault/store/platform-collection.store.ts`, `vault/services/platform-collection-api.service.ts`, `vault/pages/platform-collection-detail/`, `vault/pages/collections/` (Explore segment), `vault/pages/explore-topic/` (See All), `apps/mobile/epics/epic-platform-collections-refined.md` |
| 19 | Multi-Language Support (i18n) | 🔄 In progress | `apps/mobile/epics/epic-multi-language-support.md` — ngx-translate UI + native-language learning content (en/ar/uk/tr/es/ru); LC-I18N-01 to LC-I18N-62. Phases 1–3 (foundation, string extraction, language selection UX) complete. Phases 4–7 (RTL, content localization, QA) remaining. |
| 20 | User Onboarding | ✅ Implemented | `features/onboarding/`, `apps/mobile/epics/epic-user-onboarding.md` — 6-step guided first-run flow (language → welcome → motivation → level → seed vault → goal), Home activation checklist, empty-state CTAs. Language picker on auth pages (login, register, forgot-password). LC-ONB-01 to LC-ONB-18. |
| 21 | Social Sharing | ✅ Implemented | `features/sharing/`, `apps/api/src/shares/`, `apps/mobile/epics/epic-social-sharing.md` — share collections/stories via email, accept/reject notifications, optional sync mode with unsync. LC-SH-01 to LC-SH-21. All 5 phases complete. |

### Implemented page inventory

**Vault:** vault list, word detail, collections, collection detail, add-word sheet, assign-collection sheet, category selector, CSV import, image import (in progress)

**Review:** review hub, flashcard player, session summary, custom study, mastery breakdown, session history, struggling cards

**Listen:** listen player, playlist source sheet

**Stories:** story library, generate story sheet, story reader (German + translation + grammar + keywords tabs), story complete

**Auth:** login (+ language picker), register (+ language picker), forgot password (+ language picker), reset-data sheet

**Onboarding:** language, welcome, motivation, level, seed vault, goal & finish, getting-started checklist (Home)

**Sharing:** notifications (pending shares list with accept/reject), share-sheet (email input + sync toggle modal)

**Shared:** home/dashboard, user menu, sync-status indicator, fab button

**Settings:** study goals (daily/weekly/monthly), reminders (push toggle + time picker), language (6-language picker)

---

## Streak & goals

- **Streak rule (ADR-1):** a calendar day counts toward the streak only when `distinctCardsReviewed >= dailyGoal`. Uses local timezone bucketing via `Intl.DateTimeFormat('en-CA', { timeZone })`.
- **States:** `safe` (goal met today) · `at_risk` (goal met yesterday, not yet today) · `broken` (current = 0).
- **Server-authoritative (ADR-2):** `GET /api/v1/stats/streak` computes from `reviewSessions` table (up to 500 sessions back). Client `ReviewStatsStore` keeps an optimistic local computation for instant UI; reconciles with server on load and after each session via `refreshStreak()`.
- **Defaults:** `dailyGoal = 20`, `weeklyGoal = 120`, `monthlyGoal = 500` — stored in `user_settings` (one row per user, created on registration).
- **Goals API:** `GET /api/v1/settings/me` · `PATCH /api/v1/settings/me` (fields: `dailyGoal`, `weeklyGoal`, `monthlyGoal`, `remindersEnabled`, `reminderTime`, `timezone`, `uiLanguage`).
- **`goalsSetAt`:** stamped whenever any goal field is explicitly updated — used by `SettingsStore.needsGoalSetup()` to prompt the user to set goals on first use or after 30 days.
- **Milestone celebrations:** `StreakMilestoneComponent` fires on 3/7/14/30/50/100/365-day milestones; persists `lc_last_celebrated_milestone` in localStorage to avoid re-showing.

---

## Web push reminders

- **Protocol:** VAPID Web Push via `web-push` npm package on the server + Angular `SwPush` (`@angular/service-worker`) on the client.
- **VAPID env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — public key is safe to send to clients; private key is secret (never expose).
- **`push_subscriptions` table:** `endpoint` (PK), `user_id` (FK CASCADE), `p256dh`, `auth`. One user may have multiple device rows.
- **Scheduler (ADR-5):** `ReminderSchedulerService` runs `@Cron('0 * * * *')` (hourly). Sends one push per user whose local hour matches `reminderTime`, has `remindersEnabled = true`, and has **not yet hit today's daily goal**. `lastRemindedOn` (local day key) prevents duplicate reminders.
- **Payload shape:** `{ notification: { title, body, data: { url } } }` — `ngsw-worker.js` handles the `push` event and shows the notification natively; clicking routes to `data.url`.
- **Stale subscription pruning:** `410`/`404` responses from the push service auto-delete the row.
- **iOS caveat:** Web Push works only for **installed** (Add to Home Screen) PWAs on iOS 16.4+.
- **`provideServiceWorker`** is registered in `main.ts` with `enabled: !isDevMode()`; `ngsw-config.json` is at the repo root.

---

## AI provider routing (current production config)

| Task | Adapter | Model | Config env var |
|---|---|---|---|
| Image extraction (Phase 1) | `GeminiAdapter` | `gemini-2.5-flash` (direct) | `GEMINI_API_KEY` |
| Image extraction (legacy single-pass) | `OpenRouterAdapter` | `google/gemma-4-26b-a4b-it:free` | `OPENROUTER_API_KEY` |
| Word enrichment | `OpenRouterAdapter` | `anthropic/claude-haiku-4-5` | `ENRICHMENT_MODEL` |
| Story — Pro tier | `OpenRouterAdapter` | `anthropic/claude-sonnet-4-6` | `STORY_MODEL_PRO` |
| Story — Free tier | `OpenRouterAdapter` | `google/gemini-2.5-flash` | `STORY_MODEL_FREE` |
| TTS (word audio) | `GoogleCloudTtsAdapter` | `de-DE-Chirp3-HD-Charon` | `GOOGLE_CLOUD_TTS_*` |
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
| `apps/mobile/epics/epic-story-studio-redesign.md` | Story Studio 2.0 — Explore, read, interact (LC-300–LC-345) |
| `apps/mobile/epics/epic-story-studio-redesign-design.html` | Design reference for Story Studio 2.0 |
| `apps/mobile/epics/epic-streak-goals-reminders.md` | Streak, Goals & Web Reminders epic — LC-350 to LC-368 |
| `apps/mobile/epics/design-streak-goals-reminders.html` | Design reference for Streak/Goals/Reminders screens |
| `apps/mobile/epics/epic-global-word-dictionary.md` | Global Word Dictionary & Admin epic — LC-WD01 to LC-WD17 |
| `apps/mobile/epics/epic-multi-language-support.md` | Multi-Language Support (i18n) epic — ngx-translate UI + native-language content; LC-I18N-01 to LC-I18N-62 |
| `apps/mobile/epics/epic-user-onboarding.md` | User Onboarding epic — 6-step guided first-run flow (language step first); LC-ONB-01 to LC-ONB-18 |
| `apps/mobile/epics/epic-social-sharing.md` | Social Sharing epic — share collections/stories via email, notifications, sync mode; LC-SH-01 to LC-SH-21 |
| `apps/mobile/epics/design-user-onboarding.html` | Design reference for onboarding screens |
| `apps/api/src/word-dictionary/` | Global word dictionary module (entity, service, repository, controller) |
| `apps/api/src/admin/` | Admin module — platform-collections import, platform-stories import, prompts |
| `apps/api/src/admin/prompts/platform-story.prompt.md` | Canonical AI prompt for generating platform stories (paste into AI tool) |
| `design-reference.html` | Visual design spec — open in browser before building any screen |
| `apps/api/src/` | NestJS backend source |
