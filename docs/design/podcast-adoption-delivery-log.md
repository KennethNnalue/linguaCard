# Podcast adoption delivery log

Implementation against `podcast-adoption-improvement-plan.md`, starting 3 October 2026 on main.

## Step 1 — Recommendation foundation (P1-A)

Added authenticated, bounded recommendations using canonical lexemes, active language context, committed session/recent reviews, familiarity, short duration and topic diversity. Server rejects another user's session; missing sessions use pending-sync evidence and recent vocabulary. Personal cards without canonical identities cannot inflate match counts. Discovery now follows the same active language pair as Vault.

Verification: API TypeScript check passed; recommendation ranking, existing suggestion and readiness tests passed (10 tests); whitespace check passed. Candidate limit is 200; query-plan validation against representative production volumes remains a rollout check. No production database or content was edited.

Pending: P0 reliability triage/measurement, P1 UI/continuation/preparation, P2 reinforcement, rollout validation and P3 experiment-dependent growth.

## Step 2 — First-party measurement (P0-B)

Added bounded authenticated client-event ingestion and a migration-backed event table. Meaningful-listening (30 seconds of unique audio, or full shorter duration) and completion milestones are recorded transactionally by the server with per-user/episode/audio-version deduplication. Client completion claims are rejected by the event DTO. Account and episode deletion cascade to these events.

Verification: API TypeScript passed; telemetry validation and playback qualification tests passed (8 tests). Migration is registered for normal deployment and entity bootstrap; production-volume migration/query-plan checks remain rollout work. Frontend events are wired in subsequent UI increments.

## Step 3 — Home/summary recommendation entry points (P1-B)

Added a reusable presentational card and scoped recommendation store. Home/summary load independently from review; Play bypasses preparation, Preview is read-only navigation. Visible cards record impressions; selections and actual audio play are tracked. Pending commits suppress session/recent-review wording. Cache keys include user, language context, level, placement and session. Results ignore reset/stale requests. Successful review sync refreshes recommendations.

Verification: development Angular build and app TypeScript passed; existing Home/summary tests (4) and new failure/cache/reset behavior tests (3) passed. Production is disabled by default until `PODCAST_RECOMMENDATIONS_ENABLED=true` is set at build time; development enables it. Offline cache needs a previously saved active Vault context and does not promise downloaded audio. Telemetry delivery failures are counted locally; no outbound third-party analytics is used.

## Step 4 — Honest library sections (P1-C)

Separated unfinished episodes, vocabulary recommendations, topic browsing and completed replay history. The level filter explicitly applies to new conversations, while unfinished episodes remain available across levels. The flag-disabled fallback uses generic discovery wording. Library refreshes on re-entry.

Verification: Angular development build, app TypeScript and catalogue behavior tests (4) passed; added assertions that discovery excludes history and respects the selected level.

## Step 5 — Preserve episode context (P1-D)

Preparation review sources now contain a typed episode continuation, serialized with the active session and copied to completed history. Summary URLs include a session ID and can restore their matching local history after reload. The originating episode takes precedence over a new recommendation; Home offers a return link for an unfinished preparation review. Collection detail distinguishes word audio from conversation playback, using API provenance rather than names; unpublished source episodes are hidden on detail reads.

Verification: API/app TypeScript passed; existing review persistence/player/Home and collections suites passed (13 tests). Summary route fixture was updated for its new route dependency; summary and continuation serialization tests passed (4 tests). The first Angular build caught a missing template null guard after the commit; the immediate follow-up fixes it and re-runs the build. Continuation is device-local, consistent with current review persistence; cross-device continuation requires a server contract extension.

Step 5 correction: Angular template null guard fixed; the full development build now passes (7.9 seconds). The failed build was acknowledged and corrected immediately rather than recorded as a pass.

## Step 6 — Optional, encouraging preparation (P1-E)

Replaced the dominant readiness percentage with focus-word familiarity counts, explicitly including unknown progress. Listening is primary and always available; preview expands words without mutation. Add-and-review describes its vault side effect. Long vocabulary lists start with three essentials; supporting words appear on expansion. Empty vocabulary no longer returns 100% readiness.

Verification: API TypeScript, Angular development build and readiness/ranking tests (8) passed. Existing readiness calculation remains for compatibility and word selection, but is not presented as listening comprehension.

## Step 7 — Listening reinforcement (P2-A)

Player responses expose validated turn-level lexeme references and vocabulary details. Users can replay a sentence and inspect its focus words, meanings, examples and saved status. Word inspection pauses playback. Focused controls and open word details prevent automatic control hiding. The recap offers an optional three-word recall activity with reveal buttons; neither inspection nor recall changes mastery.

Verification: API/app TypeScript and development Angular build passed; player/store suites passed (25 tests), including sentence replay. Mapping is sentence-level; precise token alignment is intentionally not claimed.

## Step 8 — Recording changes and cache resilience (P0-A)

Confirmed and fixed old listening evidence being merged into a replaced audio recording. A version change now resets ranges, position and completion before new playback is counted; same-version retries preserve evidence. Existing episode-level reward deduplication is retained. Preparation/topic cache failures no longer prevent API loading or turn a successful response into an error; late preparation responses are ignored after navigation or account changes.

Verification: API/app TypeScript, development Angular build, playback qualification/version tests (8) and catalogue tests (6) passed. Live blank-review exit, ambiguous content and malformed canonical headwords remain separate audit items; these changes do not claim to diagnose them.

## Step 9 — Journey explanation and final plan corrections (P1/P2-B)

Added the card-to-conversation explanation in the library and a concrete release/editorial/experiment checklist. Linked-collection reviews now retain episode continuation. Returning from a preparation review is measured; discovery refreshes after completion is saved. Recommendations exclude current-version listening history but allow replaced recordings; unsynced empty candidate results retain pending evidence. Summary restoration honours the requested session even if another completed session is in memory. Impressions require at least 50% visibility. Corrected the three lint issues introduced by implementation. Cache write failure after a successful vocabulary preparation no longer reports server preparation as failed.

Verification: API/app TypeScript and production Angular build passed. All API tests passed (59 suites, 212 tests); mobile/shared full run passed (88 suites, 360 tests), followed by podcast/summary tests (9 suites, 64 tests) and updated summary/cache regression tests (5 tests). Local browser fixture verified recommendation and preparation layouts and actions on desktop and 390px portrait; it used simulated vocabulary and no account mutations. Chrome control became unavailable, so this check used the in-app browser. The temporary fixture and public route were removed. See the final verification section for final counts and limitations.

## Final verification and comparison with the plan

Verified the final implementation on main after removing the temporary UI fixture:

- API TypeScript and app TypeScript: passed.
- Full configured API suite: 59 suites, 212 tests passed.
- Full mobile/shared suite: 88 suites, 361 tests passed.
- Production Angular build: passed, with stylesheet budget warnings; development builds passed during individual increments.
- Changed frontend files: ESLint passed. Repository-wide mobile lint still reports 17 existing errors in unchanged network, AI, authentication-test, onboarding-shell, settings-refresher and share-sheet files; these files have no diff against starting main `588deed`.
- Default mixed Jest command was stopped after backend AWS ESM-loading failures under the browser configuration; separate mobile/shared and API configurations passed. This is not recorded as a green default `npm test` run.
- Local browser UI fixture: desktop and 390×844 portrait checks of the real recommendation component and preparation template/actions passed. Screenshot saved outside the repository. Fixture used simulated data and no account mutations; it was removed before final builds.
- Whitespace checks passed. Implementation commits were pushed directly to main; the pre-existing `.gitignore` edit was preserved and excluded.

| Plan item | Delivery status | Remaining verification or work |
| --- | --- | --- |
| P0-A reliability/content audit | Partial: confirmed audio-version and cache defects fixed | Reproduce live blank review, startup/sync failures; trace and curate the observed production vocabulary/cue. |
| P0-B first-party measurement | Code implemented | Staging migration/database validation, retention/consent alignment and actual baseline reporting. Offline event delivery is best effort. |
| P1-A vocabulary recommendations | Implemented | Production mapping coverage and query plans; candidate limit is 200; personal cards need canonical identities to match. |
| P1-B Home/summary entry points | Implemented | Authenticated two-account/language/offline journey and user validation before activation. |
| P1-C library separation | Implemented | Verify against production content volume; in-progress history is distinct from new suggestions. |
| P1-D continuation/collection bridge | Implemented on the current device | Cross-device continuation requires a future server contract. |
| P1-E optional preparation | Implemented | User study and native device checks. Counts describe focus words, not comprehension. |
| P2-A listening reinforcement | Implemented | Screen-reader/native validation; word references are turn-level, not token-level. Recall does not modify mastery. |
| P2-B onboarding/editorial coverage | Partial: explanation and editorial workflow documented | Publish reviewed content addressing real coverage gaps; validate a real card/audio onboarding example. |
| P3 interests/reminders/discovery | Deferred as required by the plan's repeat-listening dependency | Establish repeat-listening evidence, stable experiments and consent before implementing growth nudges. No campaign was sent. |

Production vocabulary recommendations remain disabled by default. Set `PODCAST_RECOMMENDATIONS_ENABLED=true` through the web build workflow after the documented release gates. The build flag does not gate the other podcast preparation/player improvements, and it is not a percentage rollout mechanism.

The application implementation is ready for staged integration validation; the entire evidence-dependent product programme is not claimed complete. See `podcast-adoption-rollout.md` for the concrete next release checks.
