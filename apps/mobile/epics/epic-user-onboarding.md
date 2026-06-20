# Epic: User Onboarding & First-Run Activation

**A guided, skippable first-run flow that personalizes setup, seeds the vault with real words in under 60 seconds, and teaches the core loop — review, listen, read.**

| Field | Value |
|---|---|
| Epic ID | LC-ONB-01 → LC-ONB-18 |
| Total points | 47 |
| Depends on | Platform Collections (adopt) · Settings/Goals (`PATCH /settings/me`) · Vault (`CardStore`) — all implemented |
| Platform scope | Web (PWA) + iOS / Android (Capacitor). Pure Angular/Ionic flow, no native plugins. |
| Files touched | `libs/shared/domain`, `apps/api/src/settings/`, `apps/api/src/auth/`, `apps/mobile/src/app/features/onboarding/`, `apps/mobile/src/app/core/guards/`, `apps/mobile/src/app/features/home/`, `apps/mobile/src/assets/i18n/` |
| Design reference | `apps/mobile/epics/design-user-onboarding.html` |

---

## 1. Context & problem statement

The product owner wants a real onboarding: **"a full user onboarding that helps the user set up and learn how to use the application efficiently, walking through the onboarding."** Today there is none.

### What the codebase actually does today

The `features/onboarding/` folders exist but are **empty** (`pages/onboarding/`, `services/`). A new user's path is:

1. Register at `/auth/register` (name, email, password).
2. Backend `AuthService.register()` creates the user, a free subscription, and a default `user_settings` row (`goalsSetAt: null`, goals `20/120/500`).
3. `register.page.ts` immediately calls `navigateByUrl('/home')`.
4. Home renders an empty hero ring (0 cards), an empty vault, and — because `SettingsStore.needsGoalSetup()` is true — pops the `StudyGoalsPromptComponent` modal.

| Observed problem | Root cause |
|---|---|
| No welcome / value framing | The app jumps straight from registration to an empty dashboard. There is no welcome step at all. |
| Empty, intimidating first screen | New users land with **zero cards**. The hero ring shows 0%, the vault is blank, and there is no "get your first words" path surfaced. |
| No personalization | Registration collects only name/email/password. The app never asks *why* the user is learning or their *level*, so it can't tailor the starter content or a sensible daily goal (research shows goal-asking is the single biggest activation lever in language apps). |
| Features undiscovered | Vault, Review, Listen, Stories, and Explore collections must all be self-discovered by tapping tabs. Nothing teaches the core review loop. |
| No "did they onboard?" state | `UserSettings` tracks only `goalsSetAt`. There is no `onboardingCompletedAt`, so we can't gate a first-run flow or resume a partial one. |

### What this epic changes

- **A routed, full-screen, skippable onboarding flow** at `/onboarding`, entered automatically on first login and resumable mid-way.
- **Persona personalization** — ask *motivation* and *level* (Duolingo-style). These are **advisory**: they pick a recommended starter collection and pre-fill the daily goal. Target language stays **German** (content is German-only today).
- **Time-to-value in the flow itself** — a "seed your vault" step that adopts a platform collection via the existing `adopt` API, so the user exits onboarding with real, audio-backed cards.
- **Server-authoritative onboarding state** — a new `onboardingCompletedAt` (+ `onboardingStep` for resume) on `user_settings`, reconciled exactly like `goalsSetAt`.
- **A persistent Home activation checklist** ("Getting started") plus **empty-state CTAs** in Vault/Review — self-triggered guidance that, per research, completes far more often than auto-fired coachmarks.

### Research basis (best-practice grounding)

- **Get to value fast (<60s) and let the user "dive in."** Mobile onboarding that delivers a tangible result quickly retains better — for us, seeding real cards is that result. (Appcues, VWO, Plotline 2026 teardowns.)
- **Persona/goal-based onboarding.** Duolingo opens by asking *why* and *what level*; giving the user a goal to work toward increases motivation and retention.
- **Checklists over forced tours.** An activation checklist injects light gamification and lets users see remaining steps; self-triggered guidance (a "Take the tour" entry) completes ~123% more often than auto-fired coachmarks, which most users skip.
- **Empty states as activation.** Blank vault/review screens should *direct* the next action, not just sit empty.
- **Always skippable.** Flexibility to skip is a baseline expectation; nothing here is mandatory.

---

## 2. Architecture Decision Records

### ADR-1: Onboarding state is server-authoritative on `user_settings`

**Decision:** Add `onboardingCompletedAt: string | null` and `onboardingStep: number | null` (plus optional advisory `motivation` / `level`) to the existing `user_settings` table and the `UserSettings` domain type. The client treats the server value as the source of truth and keeps an optimistic local copy, exactly as `goalsSetAt` is handled today. `PATCH /settings/me` is extended to accept and stamp these fields.

**Rationale:** Onboarding completion must survive reinstall and be consistent across devices — a user who onboards on the web should not be re-onboarded on their phone. `user_settings` already follows this reconciliation pattern (`fieldTimestamps`, `goalsSetAt`), and registration already creates the row, so we extend a proven path rather than inventing a new table.

**Consequences:** One Phase-0 domain change + one Phase-1 backend change. Registration's existing default-settings creation sets `onboardingCompletedAt = null`, which is what triggers the flow. Existing users (who have rows with no value) are treated as already-onboarded — see ADR-6 / Non-goals.

### ADR-2: Onboarding is a routed full-screen flow, not a modal over Home

**Decision:** Implement onboarding as a lazy-loaded `ONBOARDING_ROUTES` at `/onboarding` (outside the authed `TabsPage` shell), driven by an `OnboardingStore` (`signalStore`). An `onboardingGuard` redirects an authenticated user whose `onboardingCompletedAt == null` to `/onboarding`; the flow redirects to `/home` on completion or skip.

**Rationale:** A routed flow gives full-screen focus, real back/next navigation, deep-linkable resume (`onboardingStep`), and a clean separation from Home. Stacking modals over an empty Home (today's accidental behavior) is cramped and fragile. This also follows the codebase's "lazy-load every feature" rule and keeps the flow out of the tab shell so the tab bar isn't shown mid-onboarding.

**Consequences:** New guard + route group + post-register redirect change (`register.page.ts` routes to `/onboarding` instead of `/home`). The guard must be ordered so it does not fight `AuthGuard`.

### ADR-3: Reuse the existing adopt + card flow for "first words" — no new seeding service

**Decision:** The seed step calls the existing `PlatformCollectionApiService.adopt()` / `PlatformCollectionStore` and lets `CardStore` refresh — the same path the Explore segment already uses. We do **not** build a bespoke onboarding seeding service or endpoint.

**Rationale:** Adopting a platform collection already creates real cards with audio, dictionary data, and SRS state. Duplicating that as onboarding-specific logic would fork vault behavior and create drift. The starter collection is just a curated `PlatformCollection` the flow recommends.

**Consequences:** Onboarding depends on at least one published platform collection existing. The flow degrades gracefully (offer "Add my own word" / "Import") when none is available or adopt fails.

### ADR-4: Persona (motivation + level) is lightweight and advisory

**Decision:** `motivation` (travel/work/family/culture/exams) and `level` (beginner/some/intermediate) are optional, stored on `user_settings`, and used **only** to (a) recommend a starter collection and (b) pre-fill the suggested daily goal (10/20/30). They do not branch the app or change the learning language.

**Rationale:** Asking the user's goal is the highest-leverage activation step, but over-fitting the product to persona answers adds complexity we don't need while German is the only content language. Keeping it advisory captures the motivation benefit cheaply and leaves room to grow.

**Consequences:** Persona answers can be skipped; the flow falls back to a sensible default collection and `dailyGoal = 20`.

### ADR-5: The Home activation checklist derives from real state, not a progress table

**Decision:** The "Getting started" checklist computes each item's done-state from existing signals — card count (`CardStore`), `goalsSetAt` (`SettingsStore`), session history (`ReviewStatsStore`/`ReviewStore`), story-opened flag — rather than persisting a separate per-step progress record. Only the *dismissed* flag is persisted (localStorage, mirroring the milestone-celebration pattern).

**Rationale:** A derived checklist is self-healing and can never disagree with reality (e.g. a user who added a word outside onboarding sees it checked). It avoids a new table and keeps a single source of truth.

**Consequences:** Each checklist item needs a cheap computed predicate. "Try a story" needs a minimal "has opened a story" signal; if none exists cheaply, scope it to "opened the Stories tab" via a localStorage flag.

### ADR-6: Skippable everywhere; re-runnable tour instead of forced coachmarks

**Decision:** Every onboarding step has Skip. Skipping stamps `onboardingCompletedAt` so the flow doesn't re-trigger. Instead of auto-firing coachmarks across the app, Home exposes a self-triggered "Take the tour" / "Replay setup" entry. Existing users (rows created before this epic, `onboardingCompletedAt` absent) are treated as onboarded and never force-entered.

**Rationale:** Auto coachmarks are mostly skipped and can feel intrusive; self-triggered guidance completes far more often. Respecting skip and not re-onboarding existing users avoids annoying the active base.

**Consequences:** A backfill consideration: treat `null`-vs-absent carefully — see LC-ONB-02. New registrations get `onboardingCompletedAt = null` (→ onboard); pre-existing rows are migrated to a non-null sentinel (→ skip).

---

## 3. Target architecture

```
  DOMAIN
  ──────
  libs/shared/domain/src/index.ts
    UserSettings += onboardingCompletedAt, onboardingStep, motivation?, level?
    OnboardingMotivation, OnboardingLevel, UpdateUserSettingsDto (extended)

  BACKEND (NestJS)
  ────────────────
    user-settings.entity.ts     += onboarding columns (nullable)
    user-settings.service.ts     create-on-register sets onboardingCompletedAt = null
                                 patch stamps onboardingCompletedAt / step / persona
    settings.controller.ts       PATCH /settings/me accepts new fields (existing route)
    auth.service.ts (migration)  backfill existing rows → non-null sentinel (ADR-6)

  CLIENT (PWA / Capacitor)
  ────────────────────────
    core/guards/onboarding.guard.ts ── authed + onboardingCompletedAt==null → /onboarding
       │
    features/onboarding/
       store/onboarding.store.ts  (signalStore: step, motivation, level, suggestedGoal,
                                    recommendedCollectionId, isSeeding)
       pages/  welcome → motivation → level → seed → goal-finish
       onboarding.routes.ts (ONBOARDING_ROUTES, lazy)
         │ reuses ▸ PlatformCollectionStore.adopt   (seed step)
         │ reuses ▸ SettingsStore + PATCH /settings/me  (goal + completion stamp)
         │ reuses ▸ CardStore (refresh after adopt)
         ▼
    /home
       home.page  += GettingStartedChecklistComponent (derived state, dismissible)
                  += "Take the tour" entry  (ADR-6)
    vault / review empty states += deep-link CTAs (adopt / add word / start session)
```

---

## 4. Story map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Domain | LC-ONB-01 | Shared types: onboarding fields, `OnboardingMotivation`, `OnboardingLevel` | 2 |
| 1 — Backend | LC-ONB-02 | `user_settings` onboarding columns + default on register + existing-row backfill | 3 |
| 1 — Backend | LC-ONB-03 | Extend settings DTO/service/controller to accept & stamp onboarding fields | 2 |
| 2 — Flow shell | LC-ONB-04 | `OnboardingStore` (signalStore) | 3 |
| 2 — Flow shell | LC-ONB-05 | `ONBOARDING_ROUTES` + `onboardingGuard` + wire `app.routes.ts` + post-register redirect | 3 |
| 2 — Flow shell | LC-ONB-06 | Shared onboarding shell/layout (progress dots, Back/Skip, step container) | 2 |
| 3 — Steps | LC-ONB-07 | Welcome step page | 2 |
| 3 — Steps | LC-ONB-08 | Motivation step page (persona chips) | 2 |
| 3 — Steps | LC-ONB-09 | Level step page (level cards + suggested-goal preview) | 2 |
| 3 — Steps | LC-ONB-10 | Seed-vault step (recommend + adopt / add-own / import) | 5 |
| 3 — Steps | LC-ONB-11 | Goal & finish step (goal stepper + reminders opt-in + complete stamp) | 4 |
| 4 — Home activation | LC-ONB-12 | `GettingStartedChecklistComponent` (derived, dismissible) | 4 |
| 4 — Home activation | LC-ONB-13 | "Take the tour" / replay-setup entry on Home | 2 |
| 4 — Home activation | LC-ONB-14 | Empty-state CTAs in Vault & Review | 3 |
| 5 — i18n | LC-ONB-15 | `onboarding.*` keys in `en.json` (baseline) | 2 |
| 5 — i18n | LC-ONB-16 | Translate `onboarding.*` into es/tr/uk/ru/ar + key-parity check | 3 |
| 6 — Polish | LC-ONB-17 | RTL pass + reduced-motion + a11y (focus order, labels) | 2 |
| 6 — Docs | LC-ONB-18 | Update `CLAUDE.md` (epic row, page inventory, onboarding namespace) | 1 |

**Total: 47 points**

---

## 5. Implementation order

```
LC-ONB-01 (domain)
  └─> LC-ONB-02 → LC-ONB-03            (backend: columns + settings patch)
        └─> LC-ONB-04 → LC-ONB-05 → LC-ONB-06   (flow shell)
              ├─> LC-ONB-07 → LC-ONB-08 → LC-ONB-09   (welcome/persona steps)
              ├─> LC-ONB-10                            (seed — needs adopt API)
              └─> LC-ONB-11                            (goal+finish — needs LC-ONB-03)
                    └─> LC-ONB-12 → LC-ONB-13 → LC-ONB-14   (home activation)
                          └─> LC-ONB-15 → LC-ONB-16          (i18n)
                                └─> LC-ONB-17 → LC-ONB-18     (polish + docs)
```

Step pages (LC-ONB-07…11) can be built in parallel once the shell (LC-ONB-06) lands. Each ticket leaves `tsc --noEmit` green across `apps/api` and `apps/mobile`. No `.spec.ts` files (per CLAUDE.md).

---

---

## LC-ONB-01 · Shared onboarding types

**Phase:** 0 — Domain · **Points:** 2 · **Depends on:** nothing

### User story
As a developer, I want onboarding fields and persona enums in `@lingua-card/shared/domain` so backend and mobile share one contract before any feature is built.

### Files to modify
| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Extend `UserSettings` + `UpdateUserSettingsDto`; add persona types |

### Implementation
```typescript
// libs/shared/domain/src/index.ts

export type OnboardingMotivation = 'travel' | 'work' | 'family' | 'culture' | 'exams';
export type OnboardingLevel = 'beginner' | 'some' | 'intermediate';

// Extend the existing UserSettings interface:
//   onboardingCompletedAt: string | null;   // ISO; null = not yet onboarded
//   onboardingStep: number | null;           // last reached step (0-based) for resume
//   motivation: OnboardingMotivation | null;  // advisory (ADR-4)
//   level: OnboardingLevel | null;            // advisory

// UpdateUserSettingsDto (PATCH body) gains the same optional fields.

/** Suggested daily goal per level — advisory pre-fill only (ADR-4). */
export const SUGGESTED_DAILY_GOAL: Record<OnboardingLevel, number> = {
  beginner: 10,
  some: 20,
  intermediate: 30,
};
```

### Acceptance criteria
- `UserSettings` and `UpdateUserSettingsDto` carry the four onboarding fields.
- `OnboardingMotivation`, `OnboardingLevel`, `SUGGESTED_DAILY_GOAL` exported from the barrel.
- `tsc --noEmit` green; no other file changed.

---

## LC-ONB-02 · Backend: onboarding columns + register default + backfill

**Phase:** 1 — Backend · **Points:** 3 · **Depends on:** LC-ONB-01

### User story
As a new user, I want my onboarding state stored server-side so I'm onboarded once and never re-prompted on another device; as an existing user, I want to never be forced back into onboarding.

### Files to modify
| File | Change |
|---|---|
| `apps/api/src/settings/user-settings.entity.ts` | Add nullable columns: `onboardingCompletedAt` (timestamptz), `onboardingStep` (int), `motivation` (varchar), `level` (varchar) |
| `apps/api/src/settings/user-settings.service.ts` | `createDefault()` sets `onboardingCompletedAt = null`; add a one-time backfill that stamps a sentinel timestamp on rows created before this epic (ADR-6) |
| `apps/api/src/auth/auth.service.ts` | No behavior change; confirm `createDefault` still runs on register |

### Implementation notes
- Follow the existing nullable-column + `fieldTimestamps` pattern already used for `goalsSetAt`.
- Backfill (ADR-6): existing rows must end up **non-null** so they are treated as onboarded. Do this in the migration/seed path, not at request time.

### Acceptance criteria
- A freshly registered user has `onboardingCompletedAt = null`.
- Pre-existing users have a non-null `onboardingCompletedAt` after deploy.
- `GET /settings/me` returns the four new fields.

---

## LC-ONB-03 · Backend: settings PATCH accepts onboarding fields

**Phase:** 1 — Backend · **Points:** 2 · **Depends on:** LC-ONB-02

### User story
As the client, I want `PATCH /settings/me` to accept `onboardingStep`, `motivation`, `level`, and a "complete" stamp so the flow can persist progress and completion.

### Files to modify
| File | Change |
|---|---|
| `apps/api/src/settings/dto/update-user-settings.dto.ts` | Add optional, validated fields (`onboardingStep`, `motivation`, `level`, `onboardingCompletedAt` or a `completeOnboarding: boolean` convenience flag) |
| `apps/api/src/settings/user-settings.service.ts` | Stamp `onboardingCompletedAt = now()` when completion is requested; update `fieldTimestamps` |
| `apps/api/src/settings/settings.controller.ts` | No new route — existing `PATCH /settings/me` carries the new fields |

### Acceptance criteria
- `PATCH /settings/me { onboardingStep: 2 }` persists resume progress.
- Completion request stamps `onboardingCompletedAt` and is reflected in `GET /settings/me`.
- Invalid `motivation`/`level` values are rejected by validation.

---

## LC-ONB-04 · `OnboardingStore`

**Phase:** 2 — Flow shell · **Points:** 3 · **Depends on:** LC-ONB-03

### User story
As a developer, I want a `signalStore` holding onboarding flow state and the persistence methods so step pages stay dumb.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/store/onboarding.store.ts` | `signalStore({ providedIn: 'root' })` |

### Implementation notes
- State: `step`, `motivation`, `level`, `suggestedGoal` (computed from `level` via `SUGGESTED_DAILY_GOAL`), `recommendedCollectionId`, `isSeeding`, `seedError`.
- Methods (rxMethod where async): `setMotivation`, `setLevel`, `next`/`back` (persist `onboardingStep` via `SettingsStore`), `recommendCollection` (pick a published `PlatformCollection`), `complete` (PATCH stamp + navigate `/home`), `skip` (stamp + navigate).
- Inject `SettingsStore`, `PlatformCollectionStore`, `CardStore`, `Router`. No new API service — reuse existing ones (ADR-3/§reuse).
- Follow CLAUDE.md store rules: `signalStore`, `patchState`, `rxMethod`, `inject()`, no `any`.

### Acceptance criteria
- `suggestedGoal` reacts to `level`.
- `complete()`/`skip()` both stamp `onboardingCompletedAt` and route to `/home`.
- Store is the only place that talks to settings/adopt; pages call store methods.

---

## LC-ONB-05 · Routes + guard + post-register redirect

**Phase:** 2 — Flow shell · **Points:** 3 · **Depends on:** LC-ONB-04

### User story
As a new user, I'm sent into onboarding right after registering and can't accidentally land on an empty Home; as a returning user mid-flow, I resume where I left off.

### Files to create / modify
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/onboarding.routes.ts` | `ONBOARDING_ROUTES`, lazy `loadComponent` per step, default → resume `onboardingStep` |
| `apps/mobile/src/app/core/guards/onboarding.guard.ts` | Authed + `onboardingCompletedAt == null` → redirect `/onboarding`; else allow |
| `apps/mobile/src/app/app.routes.ts` | Register `/onboarding` (outside `TabsPage`); apply `onboardingGuard` to the authed shell |
| `apps/mobile/src/app/features/auth/pages/register/register.page.ts` | Route to `/onboarding` instead of `/home` after register |

### Implementation notes
- Guard runs after `AuthGuard`. Wait for `SettingsStore` loaded before deciding (avoid a flash of Home); use the store's `loaded` signal.
- Login (returning user with completed onboarding) is unaffected — guard allows them straight to `/home`.

### Acceptance criteria
- Registering lands on `/onboarding` welcome.
- Manually visiting `/home` with `onboardingCompletedAt == null` redirects to `/onboarding`.
- A completed user is never redirected into onboarding.

---

## LC-ONB-06 · Onboarding shell / layout

**Phase:** 2 — Flow shell · **Points:** 2 · **Depends on:** LC-ONB-05

### User story
As a user, I see consistent progress, Back, and Skip chrome across every onboarding step.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/components/onboarding-shell/` | Layout component: progress dots, Back, Skip, projected step content slot |

### Implementation notes
- `ChangeDetectionStrategy.OnPush`, `input()` for `step`/`total`, `output()` for `back`/`skip`, content projection for the step body.
- SCSS: `@use '../../../../theme/tokens' as t;` + `utils`. No raw hex/px; use `t.$lc-space-*`, `t.$lc-radius-*`, brand tokens. Buttons via `<lc-button>`.
- "Skip" calls `OnboardingStore.skip()`.

### Acceptance criteria
- Progress dots reflect current step; Back hidden on step 0.
- Skip available on every step; fully LDS-compliant SCSS (no raw values).

---

## LC-ONB-07 · Welcome step

**Phase:** 3 — Steps · **Points:** 2 · **Depends on:** LC-ONB-06

### User story
As a new user, I get a warm, branded welcome explaining the value of LinguaCard and a clear "Get started".

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/pages/welcome/` | Welcome page (brand hero, 2–3 value bullets, "Get started" → next, "Skip for now") |

### Acceptance criteria
- "Get started" advances to motivation; "Skip" completes onboarding.
- All copy via `onboarding.welcome.*` translate keys. `<lc-button>` for CTAs.

---

## LC-ONB-08 · Motivation step

**Phase:** 3 — Steps · **Points:** 2 · **Depends on:** LC-ONB-06

### User story
As a new user, I tell the app *why* I'm learning German so it can tailor my starter content.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/pages/motivation/` | Persona chip grid (travel/work/family/culture/exams) → `OnboardingStore.setMotivation` |

### Implementation notes
- Use `<lc-category-chip>` for selectable persona chips. Selection is optional (Next works without one). Persist via store → `onboardingStep`/`motivation`.

### Acceptance criteria
- Selecting a chip highlights it and stores `motivation`; Next advances even with none selected.
- Copy via `onboarding.motivation.*`.

---

## LC-ONB-09 · Level step

**Phase:** 3 — Steps · **Points:** 2 · **Depends on:** LC-ONB-06

### User story
As a new user, I pick my level so the app suggests a sensible daily goal and starter collection.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/pages/level/` | Three level cards (beginner/some/intermediate) + live "suggested daily goal" preview |

### Implementation notes
- On select → `OnboardingStore.setLevel`; `suggestedGoal` (computed) updates the preview ("We'll aim for {{count}} cards/day").
- `level` also feeds `recommendCollection()` for the next step.

### Acceptance criteria
- Selecting a level updates the suggested-goal preview from `SUGGESTED_DAILY_GOAL`.
- Copy via `onboarding.level.*`.

---

## LC-ONB-10 · Seed-vault step (time-to-value)

**Phase:** 3 — Steps · **Points:** 5 · **Depends on:** LC-ONB-04 (adopt via store)

### User story
As a new user, I leave onboarding with real words already in my vault so I can review immediately.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/pages/seed/` | Recommended starter-collection card with "Add these words" (adopt), plus "Add my own word" and "Import" fallbacks |

### Implementation notes
- Primary action calls `OnboardingStore` → `PlatformCollectionStore.adopt(recommendedCollectionId)` (ADR-3); show `isSeeding` loading and an adopted/confirmation state with the word count. Refresh `CardStore`.
- Fallbacks deep-link to existing flows: add-word sheet (`/vault`) and import (`/vault/import`). After a fallback, the user returns to continue the flow.
- Degrade gracefully if no published collection or adopt fails (`seedError`) — surface "Add my own word" prominently.

### Acceptance criteria
- Adopting seeds real cards (verified by non-empty `CardStore` after).
- Loading, success (count shown), and error states all render.
- Copy via `onboarding.seed.*`; CTAs via `<lc-button>`.

---

## LC-ONB-11 · Goal & finish step

**Phase:** 3 — Steps · **Points:** 4 · **Depends on:** LC-ONB-03

### User story
As a new user, I confirm my daily goal (pre-filled from my level), optionally turn on reminders, and finish into the app.

### Files to create
| File | Change |
|---|---|
| `apps/mobile/src/app/features/onboarding/pages/goal-finish/` | Goal stepper pre-filled from `suggestedGoal`, optional reminders toggle, "Start learning" |

### Implementation notes
- Goal stepper writes `dailyGoal` via `SettingsStore` (reuses `PATCH /settings/me`, which stamps `goalsSetAt`) — so the Home goal-prompt won't re-fire.
- Reminders toggle is opt-in only (sets `remindersEnabled`); do **not** implement native push permission flows here (Non-goal).
- "Start learning" calls `OnboardingStore.complete()` → stamps `onboardingCompletedAt`, routes `/home`.

### Acceptance criteria
- Daily goal defaults to `suggestedGoal`; saving persists it and sets `goalsSetAt`.
- Finishing stamps `onboardingCompletedAt` and lands on Home with no goal-setup modal.
- Copy via `onboarding.goal.*`.

---

## LC-ONB-12 · Getting-started checklist on Home

**Phase:** 4 — Home activation · **Points:** 4 · **Depends on:** LC-ONB-11

### User story
As a newly onboarded user, I see a short "Getting started" checklist on Home that shows my remaining first actions and nudges me into them.

### Files to create / modify
| File | Change |
|---|---|
| `apps/mobile/src/app/features/home/components/getting-started-checklist/` | Derived, dismissible checklist component |
| `apps/mobile/src/app/features/home/pages/home/home.page.*` | Render the checklist near the top until dismissed/all-done |

### Implementation notes
- Items derive from real signals (ADR-5): **Add a word** (`CardStore.cards().length > 0`), **Set your daily goal** (`goalsSetAt != null`), **Complete your first review** (session history non-empty), **Try a story** (story-opened flag — cheap localStorage flag if no signal exists).
- Each row deep-links to the action. Persist only a `lc_onboarding_checklist_dismissed` localStorage flag (mirror milestone-celebration pattern). Auto-hide when all done.
- `OnPush`, `<lc-button>`, LDS tokens. Copy via `onboarding.checklist.*`.

### Acceptance criteria
- Items check/uncheck from real state without a separate progress store.
- Dismiss hides it permanently; all-done auto-hides it.

---

## LC-ONB-13 · "Take the tour" / replay entry

**Phase:** 4 — Home activation · **Points:** 2 · **Depends on:** LC-ONB-12

### User story
As any user, I can re-open the onboarding/setup from Home (or the user menu) on my own initiative.

### Files to modify
| File | Change |
|---|---|
| `apps/mobile/src/app/features/home/...` (and/or `shared/components/user-menu/`) | Add a "Replay setup / Take the tour" entry routing to `/onboarding` without clearing `onboardingCompletedAt` |

### Implementation notes
- Self-triggered re-entry (ADR-6). Navigating in manually must be allowed even when `onboardingCompletedAt` is set (guard only *forces* entry, never blocks voluntary entry).

### Acceptance criteria
- Entry routes to `/onboarding`; finishing/skipping returns to Home and does not corrupt completion state.

---

## LC-ONB-14 · Empty-state CTAs in Vault & Review

**Phase:** 4 — Home activation · **Points:** 3 · **Depends on:** LC-ONB-11

### User story
As a user with an empty vault or nothing due, I see a clear next action instead of a blank screen.

### Files to modify
| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/pages/vault/...` | Empty-vault `<lc-empty-state>` with "Explore collections" + "Add a word" actions |
| `apps/mobile/src/app/features/review/pages/review-hub/...` | Nothing-due `<lc-empty-state>` pointing to Vault/Explore |

### Implementation notes
- Use the existing `<lc-empty-state>` component (`icon`, `title`, `subtitle`, `[action]` slot). Deep-link to Explore (`/vault/collections`) and add-word. Copy via `onboarding.empty.*` (or existing `vault.*`/`review.*` if present — prefer existing keys, add only what's missing).

### Acceptance criteria
- Empty vault and nothing-due both render actionable CTAs.
- No raw button CSS — `<lc-button>` / `<lc-empty-state>` only.

---

## LC-ONB-15 · `onboarding.*` keys (English baseline)

**Phase:** 5 — i18n · **Points:** 2 · **Depends on:** steps merged

### User story
As a developer, I want all onboarding copy in `en.json` so no English is hardcoded in templates.

### Files to modify
| File | Change |
|---|---|
| `apps/mobile/src/assets/i18n/en.json` | Add the `onboarding.*` namespace below |

### i18n key spec (English baseline)
```jsonc
{
  "onboarding": {
    "common": {
      "back": "Back",
      "skip": "Skip",
      "next": "Next",
      "step": "Step {{current}} of {{total}}"
    },
    "welcome": {
      "title": "Welcome to LinguaCard",
      "subtitle": "Learn German with smart flashcards, audio, and stories — a few minutes a day.",
      "bulletReview": "Review with spaced repetition that adapts to you",
      "bulletListen": "Listen to native audio anywhere",
      "bulletStories": "Read short AI stories at your level",
      "getStarted": "Get started",
      "skip": "I'll explore on my own"
    },
    "motivation": {
      "title": "Why are you learning German?",
      "subtitle": "We'll tailor your starter words. You can change this anytime.",
      "travel": "Travel",
      "work": "Work & career",
      "family": "Family & friends",
      "culture": "Culture & media",
      "exams": "Exams & study"
    },
    "level": {
      "title": "How much German do you know?",
      "subtitle": "This sets a starting goal — you can adjust it later.",
      "beginner": "Just starting",
      "some": "I know some words",
      "intermediate": "I can hold a conversation",
      "suggestedGoal": "We'll aim for {{count}} cards a day"
    },
    "seed": {
      "title": "Let's get your first words",
      "subtitle": "Add a ready-made set with audio, or bring your own.",
      "recommended": "Recommended for you",
      "wordsCount": "{{count}} words",
      "adopt": "Add these words",
      "adopting": "Adding words…",
      "adopted": "Added {{count}} words to your vault",
      "addOwn": "Add my own word",
      "import": "Import from a list",
      "error": "Couldn't add those words. Try adding your own to continue."
    },
    "goal": {
      "title": "Set your daily goal",
      "subtitle": "Hit it each day to grow your streak.",
      "dailyGoalLabel": "Cards per day",
      "remindersLabel": "Remind me to practice",
      "remindersHint": "We'll nudge you if you haven't hit your goal.",
      "finish": "Start learning"
    },
    "checklist": {
      "title": "Getting started",
      "progress": "{{done}} of {{total}} done",
      "addWord": "Add your first word",
      "setGoal": "Set your daily goal",
      "firstReview": "Complete your first review",
      "tryStory": "Read your first story",
      "dismiss": "Dismiss",
      "allDone": "You're all set! 🎉"
    },
    "empty": {
      "vaultTitle": "Your vault is empty",
      "vaultSubtitle": "Add ready-made collections or your own words to start learning.",
      "vaultExplore": "Explore collections",
      "vaultAdd": "Add a word",
      "reviewTitle": "Nothing due right now",
      "reviewSubtitle": "Add more words or explore a collection to keep going.",
      "reviewExplore": "Explore collections"
    },
    "tour": {
      "takeTour": "Replay setup"
    }
  }
}
```

### Acceptance criteria
- Every string used by LC-ONB-06…14 resolves to a key here; no hardcoded English in templates.

---

## LC-ONB-16 · Translate `onboarding.*` (es/tr/uk/ru/ar) + parity

**Phase:** 5 — i18n · **Points:** 3 · **Depends on:** LC-ONB-15

### Files to modify
| File | Change |
|---|---|
| `apps/mobile/src/assets/i18n/{es,tr,uk,ru,ar}.json` | Add translated `onboarding.*` mirroring the English structure |

### Acceptance criteria
- All 6 bundles have identical `onboarding.*` key sets (run the existing key-parity check).
- Interpolation placeholders (`{{count}}`, `{{current}}`, `{{total}}`, `{{done}}`) preserved in every language.

---

## LC-ONB-17 · RTL, reduced-motion & a11y pass

**Phase:** 6 — Polish · **Points:** 2 · **Depends on:** LC-ONB-16

### Implementation notes
- Verify the full flow in Arabic (`ar`, RTL) — `LanguageService` already sets `<html dir>`; check progress dots, Back/Next arrows, chip grids mirror correctly.
- Respect `prefers-reduced-motion` for any step transitions.
- Focus order: each step focuses its heading on entry; chips/cards are keyboard-selectable with `aria-pressed`; Skip/Back have `aria-label`s via translate keys.

### Acceptance criteria
- Flow is fully usable and visually correct in RTL.
- Keyboard-only completion is possible; no motion when reduced-motion is set.

---

## LC-ONB-18 · Docs

**Phase:** 6 — Docs · **Points:** 1 · **Depends on:** everything

### Files to modify
| File | Change |
|---|---|
| `CLAUDE.md` | Mark Onboarding implemented in the epics table; add onboarding pages to the page inventory; note the `onboarding.*` i18n namespace; document `OnboardingStore` ownership |

### Acceptance criteria
- `CLAUDE.md` reflects the new feature, store, routes, and namespace.

---

## Non-goals

- **Native iOS/Android push permission flow** during onboarding — the reminders toggle only sets the preference; native opt-in is deferred to the push epic.
- **Target-language picker** — German stays the only learning language while content is German-only (ADR-4).
- **Re-onboarding existing users** automatically (ADR-6) — they're backfilled as onboarded; they can self-trigger "Replay setup".
- **A/B testing / analytics instrumentation** of the funnel — separate concern.
- **Video tutorials or animated coachmark overlays** across the app — we use a self-triggered tour + checklist instead.
- **Tests (`.spec.ts`)** — skipped per CLAUDE.md.

---

## Definition of done (epic-level)

- A newly registered user is routed into `/onboarding`, can complete or skip every step, and lands on Home with `onboardingCompletedAt` stamped and (if they used the seed step) real cards in the vault.
- Onboarding state is server-authoritative and survives reinstall / new device; existing users are never force-onboarded.
- Home shows the derived "Getting started" checklist; Vault/Review show actionable empty states; a self-triggered "Replay setup" entry exists.
- `onboarding.*` keys exist with full parity across all 6 language bundles; flow verified in RTL.
- `tsc --noEmit` green across `apps/api` and `apps/mobile`; no hardcoded strings, no raw SCSS hex/px (LDS tokens only), all buttons/empty-states via LDS components, no `.spec.ts`.
- `CLAUDE.md` updated. Design matches `apps/mobile/epics/design-user-onboarding.html`.
