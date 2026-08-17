# Epic — Home + Review Mobile Redesign

## Product contract

The implementation follows `linguacard-home-review-implementation-design.md` and is mobile-only. The learner sees a bounded daily recommendation rather than the scheduler backlog.

### Binding visual decisions

- Preserve the warm editorial cream, forest, mint, and restrained brass/gold identity.
- Gold is reserved for eyebrow labels, selected modes, small progress highlights, milestones, and meaningful counts. It is not a general CTA or surface colour.
- Normal Home never shows freeze inventory or progress toward the next freeze.
- Type Answer includes the German character accessory keys `ä ö ü ß Ä Ö Ü` whenever German is expected. Insertion is caret-aware and accessible.

## Architecture

- Containers coordinate navigation and overlays.
- NgRx Signal Stores derive learner-facing presentation state.
- Presentational components render typed view models and emit intent.
- Scheduler, answer evaluation, persistence, and technical services remain independent from presentation copy.
- No new cross-feature imports beyond the store ownership already documented in `CLAUDE.md`.
- UI uses LDS tokens and shared UI components.

## Delivery slices

### Slice 1 — Daily direction

- Typed Home and Review hero view models.
- Home states: empty, not started, in progress, complete, caught up.
- Review states: no vocabulary, not started, in progress, complete, caught up.
- Bounded session size based on the remaining daily goal.
- Review Queue is secondary and labels new vocabulary as available.
- Study mode is compact and persists through `ReviewPrefsService`.

### Slice 2 — Review focus flow

- Simplified focus shell.
- Type Answer, teaching feedback, auto-rating, and rating override.
- Flip & Rate parity.
- German character accessory row.
- Safe exit and resumable session.

### Slice 3 — Completion and progress

- Incomplete, goal-complete, and extra-practice summaries.
- Manual mastery source distinction and undo.
- Recent activity and review-history integration.

### Slice 4 — Supporting states

- Offline, sync-pending, stale, empty, and recoverable errors.
- Queue details, mastery, streak/freeze details, insights, and review settings.

## Verification

- Run the mobile production build and lint.
- Verify at narrow mobile widths and safe-area insets.
- Verify touch, keyboard, screen-reader labels, reduced motion, and dark mode.
- New Jest files remain deferred until the repository-wide test configuration issue documented in `CLAUDE.md` is resolved.
