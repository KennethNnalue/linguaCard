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
