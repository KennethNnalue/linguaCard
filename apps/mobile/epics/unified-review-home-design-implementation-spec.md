# Unified Review Home — Product, Design, and Implementation Specification

**Status:** Implemented  
**Scope:** Investigation and specification only  
**Implementation status:** Complete; verification recorded in the implementation task  
**Primary outcome:** A learner can open LinguaCard, start or resume the right review session immediately, finish it, and leave without navigating through a dashboard.

**Screen concepts:** [`design_handoff_unified_review_home/README.md`](design_handoff_unified_review_home/README.md)

---

## 1. Executive decision

Replace the current Home page and Review hub with one focused **Review home**.

The Review home is the default authenticated destination and the first tab. It answers only four questions:

1. What should I do now?
2. How long will it take?
3. Can I resume where I stopped?
4. Am I done for today?

The actual card review remains an immersive player opened from this landing view. “Combine Home and Review” means combining the two competing landing dashboards, not placing a flashcard permanently inside the dashboard.

Recommended navigation:

- **Review** — the unified default landing page.
- **Vault** — vocabulary, collections, recently added words, add/import/scan.
- **Stories** — contextual practice.
- **Listen** — audio practice.

This removes the separate Home tab and reduces the primary navigation from five tabs to four.

---

## 2. Live product investigation

### 2.1 Current route and navigation model

The authenticated app currently defaults to `/home`. Home and Review are separate first-level tabs:

- `/home` → `HomePage`
- `/review` → `ReviewHubPage`
- the bottom tab bar exposes Home, Vault, Review, Stories, and Listen

This makes the app’s primary purpose ambiguous: a learner must decide whether “Home” or “Review” is the correct place to begin reviewing.

Several redirects and entry points explicitly target `/home`, while reminder notifications already default to `/review`. The product currently has two competing default destinations.

### 2.2 Current Home responsibilities

The Home page currently presents:

- account and notification controls;
- a daily practice hero and primary review CTA;
- personal goal status;
- streak-freeze status;
- getting-started checklist;
- word of the day;
- weekly activity chart;
- scan, story, and listen quick actions;
- recently added cards;
- collection-specific review selection.

It also coordinates card, collection, category, engagement, settings, sharing, audio, review, modal, and account concerns. The page is 344 lines of TypeScript, 209 lines of template, and 735 lines of SCSS.

### 2.3 Current Review hub responsibilities

The Review hub currently presents:

- another daily review hero and primary review CTA;
- review mode and audio settings;
- queue composition;
- mastery progress;
- struggling, new-only, and custom-study shortcuts;
- recent sessions and history;
- progress navigation.

The page is 199 lines of TypeScript, 186 lines of template, and 722 lines of SCSS.

Together, the two landing pages contain nearly 2,400 lines of page-specific code and styling before their supporting stores and components are counted.

### 2.4 Duplicated and inconsistent behavior

Two root-provided presentation stores independently describe the same daily activity:

- `HomePresentationStore`
- `ReviewHubPresentationStore`

The visible recommendation can differ between them:

- Home estimates new cards using all available new items up to the remaining goal.
- Review applies the daily new-card limit and the 25% new-card ratio.
- The actual session is selected separately by `ReviewSessionBuilderService`, which also reads persisted committed events before applying the daily new-card policy.

This means neither dashboard is guaranteed to preview exactly what the session builder will start.

There is also a resume inconsistency:

- Review checks `ReviewStore.resumableSessionId()` and resumes the active session.
- Home always calls the new-session path.

A user can therefore receive different behavior from two CTAs that appear to represent the same action.

### 2.5 Product diagnosis

The problem is not primarily visual density. It is duplicated product authority.

Both pages attempt to be:

- the daily launch point;
- a progress dashboard;
- a discovery surface;
- a shortcut directory;
- a review configuration page.

Minimalism requires removing responsibilities, not merely compressing the same cards into a smaller layout.

---

## 3. Product principles

### 3.1 One obvious action

The landing page has one visually dominant action. Depending on state, it is one of:

- Resume review
- Start today’s review
- Add your first words
- Retry loading

No other filled button appears on the initial viewport.

### 3.2 Show the session, not the backlog

The learner sees the bounded session they are about to perform, for example:

> 12 cards · about 4 min

They do not see a large scheduler backlog, mastery chart, multiple queue counts, or weekly analytics before starting.

### 3.3 Completion is a valid stopping point

After the daily goal is complete, the page clearly says the learner is done. Extra practice remains available through a quiet secondary path, but the interface does not immediately replace completion with another dominant CTA.

### 3.4 Preferences stay remembered and quiet

The current study mode and audio behavior remain persistent. They appear as one compact settings row, not as multiple controls or cards on the landing page.

### 3.5 Progressive disclosure

Advanced practice and progress features remain available, but none competes with the daily review action.

### 3.6 Honest system state

The session count and duration shown on the landing page must be derived from the same candidate selection used to start the session. A preview must not promise 12 cards and launch a different number without a state change between preview and start.

---

## 4. Information architecture

### 4.1 Primary navigation

| Position | Destination | Purpose |
|---|---|---|
| 1 | Review | Start, resume, or complete today’s essential review |
| 2 | Vault | Manage vocabulary, collections, add/import/scan, recently added |
| 3 | Stories | Contextual reading practice |
| 4 | Listen | Audio practice |

The first tab label should be **Review**, not Home. “Review” describes the user’s task; “Home” only describes a location.

### 4.2 Secondary destinations

Create one secondary **More practice** destination for intentional, non-daily study:

- New words only
- Struggling cards
- Leeches
- Custom study
- Collection-specific review entry

Consolidate learning history and achievement information under **Progress**:

- today/weekly activity;
- streak and freeze details;
- mastery breakdown;
- session history.

Do not duplicate these summaries on Review home.

### 4.3 Content relocation

| Current content | New location |
|---|---|
| Daily review hero | Review home |
| Resume active session | Review home, highest priority |
| Mode and autoplay | Compact Review settings sheet; persistent settings page may follow |
| Queue due/new breakdown | More practice or an optional details sheet |
| New-only, struggling, leeches, custom study | More practice |
| Mastery, weekly chart, streak/freeze detail, session history | Progress |
| Recently added cards | Vault |
| Add word, import, scan | Vault |
| Word of the day | Remove from the landing page; reconsider later as a Vault discovery feature |
| Story and Listen shortcuts | Their existing tabs; remove duplicate quick actions |
| Getting-started checklist | Replace with a focused empty state; do not show during normal use |
| Collection picker | Collection detail or More practice; daily Review home always uses the daily source |
| Account, language, goals, reminders, theme, sync | Account/settings menu |
| Notifications | Consolidate into the account control with a badge, or retain one quiet header icon if testing proves it is needed |

### 4.4 Route policy

Recommended final route ownership:

- `/review` is canonical and renders the unified Review home.
- `/` redirects to `/review` for authenticated users.
- `/home` redirects to `/review` for backward compatibility.
- existing review deep links remain valid.
- `/review/more` owns non-daily practice choices.
- `/review/progress` remains the progress entry until the existing `/progress` and `/review/progress` duplication is separately reconciled.

All login, onboarding, auth-guard, admin-guard, wildcard, reminder, and notification entry points must be updated or verified during route migration.

---

## 5. Review home content model

### 5.1 Initial viewport

The normal ready state should fit without scrolling on a narrow phone, excluding device safe areas and the bottom tab bar.

```text
┌─────────────────────────────────┐
│ LinguaCard                 (A)• │
│                                 │
│ TODAY                           │
│ Your review is ready            │
│ 12 cards · about 4 min          │
│                                 │
│ [ Start today’s review        ] │
│                                 │
│ Type answer · Audio on      ›   │
│                                 │
│ 8 of 20 today          6-day 🔥 │
│                                 │
│ More practice               ›   │
└─────────────────────────────────┘
│ Review │ Vault │ Stories │ Listen│
└─────────────────────────────────┘
```

The progress and streak line is quiet supporting context, not a separate card. If research or usability testing shows it pulls attention away from the CTA, remove it rather than decorating it further.

### 5.2 Visual hierarchy

1. State title
2. Exact session size and time estimate
3. One primary CTA
4. Compact preference summary
5. Quiet daily status
6. One More practice link

Use the existing cream, forest, and restrained brass design language. Prefer one calm surface over a stack of cards. Avoid charts, carousels, multiple icon tiles, illustrations, promotional content, and decorative animation on this page.

### 5.3 Header

Keep the header deliberately small:

- wordmark or “Review” title on the left;
- one account/avatar control on the right;
- pending notification state may be represented by a small badge on that control.

Avoid separate profile, notification, progress, and settings icons in the header.

### 5.4 Preference summary

The preference row displays a human-readable summary, such as:

> Type answer · Audio after answer

Tapping it opens a bottom sheet containing:

- study mode: Type answer or Flip & rate;
- autoplay: Off, Answer, or Answer and example;
- a link to advanced review settings if that page is later introduced.

Changing a preference updates the persisted `ReviewPrefsService` value and refreshes the session preview.

### 5.5 More practice

“More practice” is a text row, not a second CTA. It opens a dedicated page rather than expanding a long dashboard in place. This keeps advanced choices discoverable without making every learner evaluate them during the daily flow.

---

## 6. State specification

State priority is significant. The first matching state wins.

| Priority | State | Primary content | Primary action | Secondary content |
|---:|---|---|---|---|
| 1 | Loading | “Preparing your review…” | None | Skeleton or spinner with stable layout |
| 2 | Recoverable error | “We couldn’t prepare your review” | Retry | Offline/sync explanation only if actionable |
| 3 | Resumable session | “Continue where you left off” + remaining cards/time | Resume review | End/discard session is available inside the player, not on home |
| 4 | Empty library | “Add words you want to remember” | Add words | Quiet Import words link |
| 5 | Daily goal complete | “You’re done for today” + reviewed count | None | More practice; progress status |
| 6 | Ready session | “Your review is ready” + exact cards/time | Start today’s review | Preference summary; quiet status |
| 7 | Nothing eligible | “Everything is on track” | None | Add words or More practice when applicable |

### 6.1 Resume rules

- A valid active session always outranks daily-goal completion and a newly calculated plan.
- The displayed remaining count comes from the persisted active session.
- Starting a new session must never silently replace an active session.
- If resume fails because the persisted session is invalid, clear or reconcile it and recompute the landing state with a visible recoverable message when appropriate.

### 6.2 Ready-session rules

- Preview the exact selected candidate IDs using the same policy and time zone as session start.
- Use the remaining personal daily goal as the requested limit.
- Preserve the daily new-card limit and ratio.
- Label the result “today’s session” or “your review,” not “cards due,” because the builder can include new and retention cards to fill the bounded session.

### 6.3 Goal-complete rules

- Do not show a dominant “Keep practicing” button.
- Show a concise completion statement and allow the learner to leave.
- Extra practice is available only through More practice.
- Celebration belongs to the session summary immediately after completion; revisiting Review home should be calm.

### 6.4 Offline and synchronization rules

- If local cards and scheduling data are available, review remains startable offline.
- A nonblocking pending-sync state must not displace the primary CTA.
- A blocking data-load failure shows Retry.
- Do not show technical sync terminology unless the user can act on it.

---

## 7. Interaction flow

### 7.1 Daily path

```text
Open app
  → Review home
  → Start or Resume
  → Immersive review player
  → Session summary
  → Done / close app
```

The summary may offer a single “Done” action back to Review home. Story generation, retry drills, and other cross-feature bridges should not compete with completion in the essential flow; if retained, they belong behind a quiet secondary action.

### 7.2 Advanced path

```text
Review home
  → More practice
  → Choose focused session
  → Immersive review player
  → Session summary
```

### 7.3 Settings path

```text
Review home
  → Preference summary
  → Review settings sheet
  → Change mode/audio
  → Updated exact session preview
```

---

## 8. Copy direction

Use short, literal language. Avoid motivational copy that delays the task.

Recommended English copy:

| State | Title | Supporting line | Action |
|---|---|---|---|
| Loading | Preparing your review… | — | — |
| Resume | Continue where you left off | `{{count}} cards left · about {{minutes}} min` | Resume review |
| Empty | Add words you want to remember | LinguaCard will turn them into a daily review. | Add words |
| Ready | Your review is ready | `{{count}} cards · about {{minutes}} min` | Start today’s review |
| In progress today, no active session | Keep today moving | `{{remaining}} cards · about {{minutes}} min` | Continue today’s review |
| Complete | You’re done for today | `{{count}} cards reviewed` | — |
| Nothing eligible | Everything is on track | There’s nothing you need to review right now. | — |
| Error | We couldn’t prepare your review | Check your connection and try again. | Retry |

Avoid showing “caught up” when the session policy is actually willing to select non-due retention cards.

---

## 9. Architecture specification

### 9.1 Component classification

`ReviewHomePage` is a route/container component. It may:

- bind the landing view model;
- invoke start/resume/retry commands;
- open the review preferences sheet;
- navigate to More practice, Vault, and account destinations;
- compose small presentational components if the final screen design justifies them.

It must not:

- calculate candidate eligibility;
- reproduce scheduling policy;
- derive engagement business rules;
- access HTTP or local persistence directly;
- calculate a session estimate from raw card counts.

### 9.2 Single presentation authority

Replace `HomePresentationStore` and `ReviewHubPresentationStore` with one `ReviewHomeStore` (final name may follow the chosen page name).

The store exposes a discriminated view model rather than unrelated booleans:

```ts
type ReviewHomeViewModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; recoverable: true }
  | { kind: 'resume'; sessionId: string; remainingCards: number; minutes: number; preferences: ReviewPreferenceSummary }
  | { kind: 'empty'; importAvailable: boolean }
  | { kind: 'complete'; reviewedToday: number; streak: number }
  | { kind: 'ready'; completedToday: number; goal: number; plan: ReviewSessionPlan; preferences: ReviewPreferenceSummary }
  | { kind: 'nothing-eligible'; canAddWords: boolean };
```

Only canonical state is stored. Labels, progress ratios, preference summaries, and action kinds are computed.

### 9.3 Exact session planning

Introduce a shared session-plan operation at the review application boundary. It must use the same candidate selection inputs as `ReviewSessionBuilderService.start()`:

- source;
- mode;
- direction;
- requested limit;
- current time;
- user time zone;
- daily new-card policy derived from committed events;
- current card scheduling states.

Suggested contract:

```ts
type ReviewSessionPlanResult =
  | { kind: 'ready'; cardIds: readonly string[]; newCards: number; reviewCards: number; estimatedMinutes: number }
  | { kind: 'empty-library' }
  | { kind: 'nothing-eligible' }
  | { kind: 'load-failed'; error: ApplicationError };
```

The start command should consume the current plan when it is still valid, or atomically re-plan and update the UI if source data changed. Do not maintain a third approximation in the presentation store.

The plan must be invalidated when any of these inputs change:

- card collection or scheduling state;
- committed review events affecting the new-card limit;
- daily goal;
- time zone or review-day boundary;
- review mode when it changes duration;
- active session state.

### 9.4 Store dependencies

Expected dependency direction:

```text
ReviewHomePage
  → ReviewHomeStore
      → ReviewSessionPlanningService
      → ReviewStore
      → EngagementStore
      → ReviewPrefsService
      → SettingsStore

ReviewSessionPlanningService
  → ReviewSessionBuilder domain selection
  → CardStore / scheduling projection
  → ReviewLocalRepository for daily policy inputs
```

The page should not inject `CardStore`, `VaultV2Store`, `CollectionStore`, or `ReviewFilterService` merely to build landing-page counts.

### 9.5 Store lifetime

`ReviewStore` remains application-wide because an active session must survive leaving and returning to the landing route.

The unified presentation store may remain root-provided if it performs shared plan caching and invalidation. If it only derives route UI and does not need to survive navigation, prefer route-scoped provision. Make this decision after the session-plan API is finalized; do not default to root scope solely because the two stores it replaces were root-provided.

### 9.6 Player behavior

Keep `ReviewPlayerService` as the launch boundary and keep the existing immersive modal behavior in this project phase. The landing refactor must preserve:

- typing-mode keyboard handling;
- audio preparation;
- active-session persistence;
- safe exit and resume;
- completion navigation;
- offline commits and synchronization.

Do not combine the review player component into the landing component.

---

## 10. Proposed file changes

Final paths may be adjusted during implementation, but responsibilities should remain as follows.

### Add

- `features/review/pages/review-home/review-home.page.ts`
- `features/review/pages/review-home/review-home.page.html`
- `features/review/pages/review-home/review-home.page.scss`
- `features/review/store/review-home.store.ts`
- `features/review/application/review-session-planning.service.ts`
- focused tests for view-model states, planning parity, resume priority, and route behavior
- `features/review/pages/more-practice/*` if no suitable existing container can host the secondary practice links

### Modify

- `app.routes.ts`
- `tabs.page.ts`
- `tabs.page.html`
- authentication/onboarding/guard redirects that target `/home`
- translation files for the unified copy and tab label changes
- `ReviewSessionBuilderService` so preview and start share selection/policy resolution
- `ReviewPlayerService` only if needed to accept a validated plan or return a typed launch result
- Progress navigation to receive the relocated history/mastery entry points

### Retire after migration verification

- `features/home/pages/home/*`
- `features/home/store/home-presentation.store.ts`
- `features/review/pages/review-hub/*`
- `features/review/store/review-hub-presentation.store.ts`
- Home-only components that have no remaining destination

Do not delete old routes/components until all direct imports, deep links, guards, notification targets, and tests have been migrated.

---

## 11. Delivery plan and approval gates

### Gate 1 — Approve this product structure

Confirm:

- Review is the default and first tab.
- Home is removed as a product concept.
- the landing screen contains one primary CTA.
- progress and advanced practice move off the landing screen.
- daily completion does not promote another dominant session.

No screen design should begin until these structural choices are accepted or revised.

### Gate 2 — Design the screens

Create and review:

- Review home at narrow and wide mobile widths;
- all state variants in Section 6;
- review settings sheet;
- More practice page;
- any necessary Progress consolidation changes;
- light and dark themes;
- keyboard, safe-area, and reduced-motion behavior.

The design review must verify that the ready state works without scrolling at the target narrow-phone viewport.

### Gate 3 — Implement foundations

1. Add exact session planning with parity tests against session start.
2. Add the unified discriminated presentation store.
3. Add resume-first behavior and typed launch failures.
4. Keep the old pages temporarily available while the new route is developed.

### Gate 4 — Implement the unified UI

1. Build the approved Review home.
2. Build the preference sheet and More practice destination.
3. Connect existing Progress, Vault, Stories, and Listen destinations.
4. Update translations and accessibility labels.

### Gate 5 — Migrate navigation and remove duplication

1. Make `/review` canonical and change the default redirect.
2. Reduce the tab bar to four entries.
3. Redirect `/home` to `/review`.
4. Update guards, onboarding, login, notifications, and internal links.
5. Remove the old Home and Review hub only after route/deep-link verification.

### Gate 6 — Verify

Run focused tests, TypeScript checks, lint, and production build. Perform device-level QA for iOS, Android, and PWA behavior.

---

## 12. Acceptance criteria

### Product

- Opening the authenticated app lands on Review.
- Home and Review are no longer separate tabs or competing dashboards.
- The normal initial viewport contains one dominant action.
- A learner can start a daily review with one tap.
- A learner with an active session sees Resume, not Start.
- Completing the daily goal produces a clear stopping state.
- Advanced practice, progress, and vocabulary management remain discoverable within two taps.

### Data and behavior

- The displayed card count matches the session that starts when underlying state has not changed.
- Preview and start share the same daily new-card policy, time zone, source, and candidate selector.
- Starting from Review home cannot silently replace an active session.
- Offline-capable review remains available when local data exists.
- Blocking and nonblocking failures are represented distinctly.

### Design

- The ready state fits on the target narrow-phone viewport without scrolling.
- No chart, recent-content feed, quick-action grid, mastery card, queue card, or session-history list appears on Review home.
- Only one filled CTA is present in the initial viewport.
- Touch targets are at least 44×44 CSS pixels.
- Text supports system font scaling without clipping.
- Light/dark themes and safe-area insets are supported.
- Motion respects `prefers-reduced-motion`.

### Accessibility

- The page has one `<h1>` describing the current state.
- Loading and errors are announced appropriately without repeatedly interrupting screen readers.
- Progress uses accessible text in addition to visual styling.
- Icon-only account/notification controls have explicit labels.
- The preference row exposes its current value and button semantics.
- Focus returns predictably after closing the settings sheet or review player.

### Engineering

- There is one landing presentation store.
- Landing components contain no scheduling or persistence logic.
- No duplicated session-size calculation remains in Home/Review presentation code.
- Tests cover every discriminated landing state.
- Tests prove preview/start selection parity and resume priority.
- Relevant TypeScript checks, lint, tests, and production build pass.
- No unrelated feature behavior changes during the landing-page migration.

---

## 13. Measurement plan

Measure whether the simplification improves the essential task:

- app open → review start conversion;
- median time from app open to review start;
- daily review completion rate;
- resume success rate;
- review launch failure rate;
- exits from the completed state;
- usage of More practice and preference settings;
- accidental back-and-forth navigation between landing destinations, expected to disappear.

Avoid vanity metrics such as total landing-page taps. The desired behavior is fewer decisions and a shorter path to a completed review.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Removing dashboard content makes features feel lost | Relocate each feature explicitly and verify it remains reachable within two taps |
| Route migration breaks deep links or reminders | Keep `/home` redirect compatibility and audit every current `/home`/`/review` entry point |
| Preview becomes stale before start | Invalidate by input changes and re-plan atomically at launch |
| A new session replaces resumable work | Make resume the highest-priority state and guard the start command |
| Progress motivation is weakened | Retain one quiet daily status line and put full progress one tap away; validate in usability testing |
| Empty state becomes a dead end | Offer Add words as primary and Import words as secondary |
| “Minimal” becomes visually empty but architecturally complex | Remove responsibilities and stores, not only visible markup |

---

## 15. Recommended decisions for approval

1. **Use Review as the default route and first tab.**
2. **Retire Home as a separate page and label.**
3. **Keep the flashcard player immersive rather than embedding it in the landing page.**
4. **Show exact bounded session size and estimated time; hide backlog counts by default.**
5. **Use one compact preference row and one More practice link as the only secondary actions.**
6. **Move analytics/history/mastery to Progress and vocabulary/discovery to Vault.**
7. **Treat daily completion as permission to leave, not an invitation to immediately continue.**
8. **Build exact session planning before building the new screen so the interface cannot misrepresent the session.**

Once these decisions are approved, the next artifact should be the screen designs and state variants—not implementation code.
