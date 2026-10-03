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
