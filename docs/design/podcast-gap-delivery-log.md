# Podcast gap delivery and verification

## Stage 1 — 4 October 2026

Baseline main/deployed behavior inspected at `8bebc39`. Stage 1 was partial: no preview route intent, singular counts rendered as “1 words”, discovery scope lacked visible copy, and multiple recommendations preceded unfinished listening.

Implemented explicit read-only preview intent with focus after data arrives and reset on Ionic re-entry, translated singular/count copy in all six interface languages, discovery-scope explanation, resume-first ordering, and one initial library recommendation with explicit expansion. Existing preparation/listening behavior is retained.

Local verification: four focused preview/discovery tests passed; app TypeScript passed; production Angular build passed with existing stylesheet budget warnings; changed-file ESLint and whitespace checks passed. Live deployed verification pending after push.

The existing main checkout's unrelated `.gitignore` edit is excluded from commits.

Deployment verification caught a translation insertion error in `8b25d1f`: the new namespace had been inserted into a different top-level object. Corrected against the original JSON with an anchored podcast namespace; parsed and checked all six resource bundles. Stage 1 remains pending until the correction is deployed and checked live.

Stage 1 live verification after `a872864`: production shows Continue listening before one initial recommendation, visible filter scope, correct singular English copy, and Preview opens/focuses vocabulary without saving or starting playback. Screenshot: gap-verification/stage1-preview.jpg. Remaining responsive/accessibility matrix is tracked under Stage 5.

## Stage 2 — 4 October 2026

Production read-only tracing confirmed the old collection has a persisted platform source pointing to a published playable episode; collection details now resolve that established relationship without name matching or a data backfill. Regression tests cover valid and unavailable source episodes.

A bounded, reversible migration corrects the exact malformed transcript-import lexeme and exact personal English reden localization found in production, preserving identifiers and scheduling. Import and manifest validation reject incomplete vocabulary parentheses while retaining legitimate phrases. PostgreSQL up, repeated up and down were exercised with fixture rows inside a rolled-back transaction.

Review-sync regression tests verify failure retention, commits added during an in-flight request and duplicate-accepted responses. The observed blank exit is not reproduced as a visual defect; an empty accessibility snapshot is insufficient evidence. Latency budgets and dedicated-account failure journeys remain open.

API health and frontend version metadata expose deployed revisions. Translation cache policy is corrected so updated resource files can revalidate. Local verification: 24 focused API tests and 11 review-sync/persistence tests passed; API build and whitespace checks passed. Production deployment/content verification pending.

Deployment `6368baa`: both public revision endpoints match. Production read-only queries confirm corrected `also` and `to talk / chat`; translation Cache-Control is now no-cache. The live collection journey exposed that cached list navigation bypasses the detail endpoint: source eligibility must also be resolved in the authenticated list read. Added one batched resolver shared by both paths and a list-navigation regression test; live verification remains pending this follow-up.

Follow-up `386c4dd` is live on the API. The production collection now visibly has distinct Listen to words and Play conversation actions, retaining 15 words and 7 due. Screenshot: gap-verification/stage2-collection.jpg. Review/Review all already carry the resolved episode ID in their source contract; live completion on a disposable account is still pending.

## Stage 3 — 4 October 2026

Added backward-compatible explicit fit (strong / overlap / starter), truthful translated fit copy in six languages, policy vocabulary-v2 and topic variety restricted to the same fit tier. Strong means three distinct reviewed matches with no more than half focus words new; this is a product rule, not a comprehension prediction.

Twelve focused recommendation tests passed, both application TypeScript checks passed, changed frontend ESLint passed, and the production Angular build passed with existing stylesheet budget warnings. Read-only production coverage is recorded under docs/verification: 11 playable German/English episodes, 141 of 1,105 reviewed canonical lexemes covered, and 457 unmapped legacy cards. No older-episode omission exists within the current 200 candidate bound. Deployment and live fit copy verification pending.

Stage 3 live at `cc99f4a`: after activating the visible PWA update, Home displays Some vocabulary overlap with the unchanged exact 1-word count. The in-progress review remains at 48 cards; no review answer or listening completion was submitted. Screenshot: gap-verification/stage3-fit.jpg. The PWA can serve a prior build until its update prompt is activated, even when the public version endpoint reports the newest deployment.

## Stage 4 API contract — 4 October 2026

Server-issued, user/version/language-bound exposures validate attribution. Explicit selection establishes a journey; unselected impressions never receive listening credit. Review transitions mark assisted journeys; actual-play events establish starts. Progress retains canonical milestone/reward idempotency and adds unique journey/local-date listening ranges for repeat-day analysis. Optional fields preserve older clients. Independent switches and separately persisted stable assignments have cascading account deletion.

Five focused suites (22 tests) and API TypeScript pass. Assignment migration repeated-up, conflict behavior, account cascade and down passed against PostgreSQL inside a rolled-back transaction. Report/metric definitions and rollout configuration are documented; legacy repeat-day baseline is unknown. API deployment and frontend context propagation remain pending.

API `6fae036` is deployed before frontend propagation. Frontend journey context is persisted by account, active language context and episode/version, and frozen into review continuation. Explicit catalogue/collection entry and replay clear recommendation origin. Selection and assisted transitions are ordered ahead of actual starts; telemetry is bounded/best effort and never blocks navigation. Progress waits for the bounded start request and retains its existing retry handling. New account checks prevent delayed progress from writing under another account.

Six focused frontend suites (14 tests) passed, including account/language changes, audio replacement, same-device restore, review persistence, replay and slow telemetry. Both application TypeScript checks and changed-file ESLint passed. Production Angular build passed with existing stylesheet budget warnings; final integration build is repeated after the remaining entry-point edits. Optional preparation audioVersion and exposure learningContextId improve restoration while preserving absent-field compatibility. Live direct/assisted listening reconciliation remains pending a disposable test account.

Full integration baseline: 62 API suites / 228 tests and 92 frontend suites / 376 tests passed. These runs include the released journey work; newly added onboarding behavior is additionally verified by focused suites. Follow-up integration found that queued progress must capture its original journey and same-episode starts must be deduplicated by journey, not by episode; regression coverage now checks both. Additional plural fixes cover one-word preparation and unknown review progress, with translated pending/cache copy and reduced-motion scrolling.

Production baseline report (28 September–4 October, partial week) executed successfully: 80 legacy impressions, 3 selections, 23 starts, 11 authoritative meaningful milestones, 8 completions; two committed reviewers. These counts include audit activity and have unvalidated historical attribution. Repeat-day primary is NULL/unknown and there are zero mature journey listeners; do not infer conversion or uplift from them.

## Stage 5 technical closure — 4 October 2026

A factual onboarding example is read from a published same-language/same-level conversation whose canonical vocabulary overlaps the selected platform collection and whose timed transcript contains the exact headword. Substrings, different inflected forms and invented examples are excluded. The optional post-adoption demonstration uses a bounded conversation excerpt, with no autoplay/save/reward action; failure leaves onboarding usable. Account changes reject old example responses. Editorial priorities have a reproducible read-only query using shared administrator vocabulary only.

Remaining external gates: disposable-account live direct/assisted completion, offline/account-switch/failure journeys; physical native devices; editorial listening/sense checks and the 5–8-reviewer study. The user's existing 48-card review is left intact. No claim of those gates passing is made from unit tests or screenshots.

Final local verification: production Angular build passed. Eight focused onboarding/journey tests passed, in addition to three new API example tests. Changed-file lint passes. Repository-wide lint reports 17 existing errors in ten files; byte comparison against initial commit 8bebc39 confirms all ten are unchanged by this work. Existing stylesheet budget warnings remain.

Production read-only example query confirms the canonical shared word Licht / light in Meine neue Wohnung, with an exact transcript occurrence and a published audio interval of 26.180–32.799 seconds. This verifies source linkage and timing metadata, not editorial audio quality or the new-account onboarding UI.
