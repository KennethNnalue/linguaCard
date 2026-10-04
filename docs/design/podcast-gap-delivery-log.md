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
