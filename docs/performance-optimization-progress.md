# Performance optimization progress

Baseline date: 2026-09-03

This ledger tracks performance work in small, independently verified phases. Existing functionality, native behavior, offline support, and localization must remain intact.

## Baseline

- Production build: successful in 9.9 seconds.
- Initial JavaScript and CSS: 1.58 MB raw; Angular estimated 352.6 KB transferred.
- Complete generated JavaScript: 4.54 MB raw across 260 files.
- Generated fonts: 1.55 MB across 68 files.
- Component style budget warnings: 17.
- Explicit `OnPush`: 90 of 106 components.

## Work log

### Phase 1 — Measurement and dependency boundaries

- [x] Capture the production bundle baseline.
- [x] Add `npm run build:stats` and a repeatable bundle report.
- [x] Remove eager application-wide AI provider registration. AI services remain tree-shakable root services and the OpenAI adapter remains dynamically imported when timestamp generation is requested.
- [x] Verify the production build and measured bundle delta: initial output decreased from 1.58 MB to 1.44 MB raw, and Angular's estimated transfer decreased from 352.6 KB to 322.2 KB.
- [x] TypeScript verification passes. The selective-preloading tests pass (2 tests). Project lint remains blocked by 18 pre-existing errors; the touched production files introduced no new lint finding.
- [ ] Add enforceable bundle budgets after the first reductions establish realistic thresholds.

### Phase 2 — Loading strategy

- [x] Replace `PreloadAllModules` with delayed selective preloading for the four alternate primary tabs.
- [x] Keep hashed main/polyfill/style files in the prefetched shell while moving `chunk-*.js` route chunks to lazy service-worker caching.
- [x] Verify the generated service-worker manifest: 5 shell URLs prefetch; 253 route chunks cache lazily.
- [ ] Verify common-route transitions and offline behavior.

### Phase 3 — Fonts and global styles

- [ ] Inventory actually used font families, styles, and weights.
- [ ] Reduce global font variants and lazy-load specialist typography.
- [ ] Audit optional Ionic utility CSS.
- [ ] Resolve the largest component-style budget warnings without visual regressions.

### Phase 4 — Startup work

- [ ] Move route-specific stores and history loading out of `AppComponent`.
- [ ] Parallelize independent authenticated startup requests.
- [ ] Keep cached content available while server reconciliation runs.
- [ ] Split core and feature translation bundles while preserving translation correctness.

### Phase 5 — Runtime rendering and media

- [ ] Add appropriate image lazy loading, async decoding, and dimensions.
- [ ] Bound native artwork download concurrency and cache size.
- [ ] Audit non-OnPush components and expensive template computations.
- [ ] Defer below-the-fold and secondary UI where measurements show benefit.

### Phase 6 — API and persistence

- [ ] Add response compression and safe cache/validation headers.
- [ ] Push card filters and pagination into database queries.
- [ ] Bound list payloads and return lightweight list DTOs.
- [ ] Verify compound indexes with representative query plans.
- [ ] Measure large local persistence reads/writes before changing storage layout.

## Verification rules

After each phase:

1. Run the relevant focused tests.
2. Run TypeScript checks and lint for affected projects.
3. Run `npm run build:stats` and record the delta.
4. Inspect the diff for unrelated changes.
5. Exercise affected web, native, offline, RTL, and update behavior in proportion to risk.

## Verified remaining opportunities

Verified against the 2026-09-03 production build and current source:

- Generated fonts remain 1,409.4 KiB across 68 files. All configured font families are referenced, so removing a family requires visual verification; individual weight/style reduction remains to be audited.
- Optional Ionic `flex-utils.css`, `float-elements.css`, `text-transformation.css`, and `display.css` contribute about 22 KiB of global CSS, with no matching application utility-class references found. `padding.css` is still required by one template; text alignment utilities have two references.
- All 26 application `<img>` elements lack `loading`, `decoding`, and explicit `width`/`height` attributes. Above-the-fold images must be classified before applying lazy loading.
- Root startup still eagerly imports Review, Engagement, Vault, Stories, Settings, Sharing, and AI-audio implementation code through `AppComponent` and sync-handler initializers.
- The cards compatibility endpoint fetches every 100-row cursor page and applies state/category filters in memory.
- Stories and collection list endpoints are unbounded, and collection detail aggregates counts for every user collection.
- Podcast catalogue grouping repeatedly filters the complete episode list once per topic.
- No API response compression or explicit HTTP validation/cache policy is configured in the NestJS application source.

Requires runtime or visual evidence before implementation:

- Removing or substituting any font family.
- Deferring translation initialization.
- Changing animation providers or removing Zone.js.
- Normalizing local persistence records.
- Adding database indexes without representative `EXPLAIN ANALYZE` output.
