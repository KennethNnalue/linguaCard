# Live application comparison with the vocabulary-to-listening plan

Audit date: 4 October 2026. Reference: the user's pasted plan dated 3 October 2026, originally inspected at `a31c147`. Supporting checkout: `8bebc39`. No application code or production content was changed by this audit.

## Conclusion

Most of the P1 product journey is implemented, and substantial P2-A reinforcement is also present. The remaining programme is mainly reliability/content cleanup, stronger relevance, measurement attribution, and production validation. This is not an unimplemented-feature backlog from scratch.

Live recommendations are enabled: Home displayed an actual recommendation, and the library displayed four after a fresh load. Older delivery documentation saying production recommendations are disabled by default describes the build default, not the observed deployment.

## Evidence and limits

Inspected the authenticated production application in Chrome: Home with an existing review, recommendation preview, expanded focus vocabulary, library, episode resume player, sentence vocabulary panel, two podcast preparation collections, and review resume/exit. Checked Home and library at 390 × 844 portrait web size, then restored the viewport and the original All discovery filter.

No answers were submitted, words saved, review session completed, or episode completion claimed. Existing review resumed to card 3 and was left without rating it. No fresh audio playback was initiated. Vault remained at 1,480 items between the initial read-only preview and later Vault inspection. This supports the preview's read-only behavior in this walkthrough; it is not a database mutation trace.

The deployed revision was not established. Backend semantics, summary completion, recall, offline behavior, analytics persistence and native behavior are explicitly code-supported or unverified below. Existing delivery logs describe earlier test runs; those tests were not rerun as part of this audit.

## Comparison by work package

| Plan package | Status | Evidence and remaining work |
| --- | --- | --- |
| P0-A reliability/content | Partial | Review resume and exit returned visually to Home. The broad `to talk / speak` cue is still live. Audio-version and cache fixes are documented and present in the checkout. Malformed vocabulary, slow startup and sync failure still require individual reproduction/content tracing. |
| P0-B measurement | Partial | Client ingestion and server milestone deduplication exist in code. Recommendation attribution is not propagated into actual playback or server milestones. No live event-table, reporting baseline, timezone metric, consent or retention validation was performed. |
| P1-A matching | Implemented foundation; quality work remains | Live recommendations expose actual word previews. Code joins canonical lexemes, uses current-session/seven-day commits, filters language/level, deduplicates lexemes and separates listening history. Mapping coverage, sense quality and production query plans remain unverified. |
| P1-B Home/summary | Home live; summary code-supported | Home keeps review first and presents one conversation with Play/Preview. Summary has a recommendation or originating-episode continuation, and preserves Stories. No new summary was reached in this audit. Preview needs another click to reveal words. |
| P1-C library separation | Live, with deviations | Continue listening, topic browsing and completed replay history are separate. Recommendations render ahead of Continue, contrary to the original sequence. Discovery level scope is no longer explained visibly. |
| P1-D continuation/collection bridge | Partial live verification; code implemented | `Und was hast du gemacht?` collection has separate word/conversation actions. `Meine neue Wohnung` collection has only word audio. Typed continuation and summary restoration are present in code; the full preparation-review-summary-reload journey was not exercised. Storage is device-local. |
| P1-E preparation | Live | Listen is primary; vocabulary is optional and expandable; counts replace readiness percentage; focus-word limits and vault side effects are explained. Long lists are collapsed. No save action was invoked. |
| P2-A reinforcement | Player live; recap code-supported | Replay sentence and context/definition/saved-state inspection are present. Optional up-to-three-word recall and truthful `Words in this conversation` recap exist in code. Native/accessibility and actual completion remain unverified. |
| P2-B editorial/onboarding | Partial | Library introduction explains vocabulary-to-conversation. A real card/audio onboarding demonstration and coverage-driven editorial programme remain outstanding. |
| P3 growth | Deferred | Interest controls, dismissals and match-based opt-in reminders are not delivered as this programme. Deferral is consistent with the plan's repeat-listening evidence dependency. |

## Concrete remaining gaps

### 1. Reliability and content audit remains unfinished

The existing review still asks for German for `to talk / speak`. The plan's ambiguity therefore persists at the cue level. This audit did not re-submit `sprechen` or establish whether accepted-answer handling has changed. Curate the specific sense/cue or supported alternatives after tracing its provenance.

The malformed `also (Meine Mutter ist Italienerin` entry was not independently located in this pass; neither the delivery log nor this walkthrough establishes a fix. Startup/sync problems also cannot be called resolved from successful navigation alone.

The review exit accessibility tree briefly contained no app nodes, but the screenshot showed the normal Home screen. This is not evidence of a persistent visual blank-page regression.

### 2. Recommendation relevance needs refinement

Home recommended an A1 conversation on professions/tools because of one recent-review match: `zu`. Its focus preview showed 0 familiar, 2 to practise and 29 new to the vault. The count itself can be true while the practical relevance remains weak.

The original three-match threshold is a preference, not a hard minimum; this is not a proven counting bug. Still, the fallback should more clearly communicate a weak fit, or favor a manageable editorial starter. Common function words such as `zu` and `von` can dominate an otherwise thin match. Phrase/sense and editorial mapping work remains acknowledged in the refinement log.

Ranking currently examines the newest 200 playable candidates. Older strong matches can fall outside that pool in a larger catalogue. Inspect mapping coverage and query plans before treating the MVP as a mature recommendation service.

### 3. Library hierarchy and discovery wording need finishing

The original order was Continue → Practise → Explore → Recently listened. The current UI deliberately puts recommendations first; four full cards on portrait web push resume well below the initial screen. The later UI refinement documents this change, so it should be treated as a product deviation to validate rather than an accidentally omitted feature. Consider a bounded first recommendation, compact rail or returning-user resume priority.

The library shows All/A1/A2/B1/B2 with no visible explanation that the filter applies to discovery. A2 selection can retain A1 unfinished episodes and A1 topic browsing, as intended. Restore explanatory copy to avoid the original confusion.

### 4. Preview and count copy have small live defects

- Home `Preview words` opens preparation with vocabulary still collapsed; a second `Preview words` click is required. Pass explicit preview state so the destination opens the promised content immediately without saving it.
- A one-word match is rendered as `1 words from recent reviews` or `1 words from your vocabulary`. Use singular/plural copy.

### 5. Collection bridge needs legacy/content reconciliation

`Podcast · Und was hast du gemacht?` exposes `Play conversation`; `Podcast · Meine neue Wohnung` does not. The API suppresses provenance when the source episode/topic is unpublished or audio is missing. Therefore the latter observation alone does not prove a frontend defect. Check the old collection's stored source episode and publication/audio state, and repair valid missing provenance without deriving identity from its name.

### 6. Measurement cannot yet attribute the whole recommendation funnel

Selection/impression events include recommendation ID, placement and policy version. The player `started()` emits only episode ID. Server meaningful-listening/completion metadata includes only audio version. Recommendation navigation does not carry attribution into the player, and preparation review events also omit the originating recommendation context. Level is not included in the inspected event metadata.

Events exist, but the original requirement to distinguish placement/policy through qualified listening and completion is incomplete. Persist a bounded exposure/selection context and define attribution across resume/replay; retain server-authoritative milestone deduplication. Client telemetry is best effort with no offline queue. Verify real persisted events and build the weekly timezone-aware baseline and guardrail reports.

### 7. Release validation and controlled rollout remain outstanding

The implementation uses a build-wide recommendation flag. There is no stable cohort/percentage mechanism for the planned experiment, or independent Home/summary/library switches in the inspected code. Live recommendations are already visible, so reconcile activation with the remaining release gates.

Still needed: two-account/language isolation; complete ordinary-review and preparation-review journeys; same-device leave/resume/reload; offline metadata without audio; slow network and playback errors; audio replacement/reward retries; keyboard/screen reader/large text; native iOS/Android; production database/query-plan validation; and the 5–8 reviewer task study.

## Recommended next order

1. Finish the ambiguous/malformed content and reliability audit; validate production analytics persistence and carry recommendation attribution through playback/milestones.
2. Complete the critical preparation-review-return and offline/account/language integration checks, including old collection provenance.
3. Fix the preview handoff, discovery-scope label and singular copy; validate resume prominence and low-overlap recommendation wording.
4. Measure canonical coverage, create reviewed content for common uncovered word clusters, and add a real onboarding example.
5. Establish baseline traffic, stable cohort assignment and reviewer feedback before controlled experiments or reminder features.

Supporting implementation references: `podcast-recommendations.service.ts`, `podcast-recommendations.ts`, `podcast-recommendations.store.ts`, recommendation slot/card components, library/preparation/player/completion pages, session-summary template, `podcast-events.service.ts`, `podcast-learning-loop.service.ts`, and collection API mapping. Existing evidence programmes are recorded in `podcast-adoption-delivery-log.md`, `podcast-adoption-rollout.md`, and `podcast-ui-refinement-delivery.md`.
