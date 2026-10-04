# LinguaCard gap implementation and verification plan

Date: 4 October 2026. Status: proposed implementation backlog; no implementation or deployment performed by this plan.

Baseline: [live comparison](podcast-live-plan-comparison-2026-10-04.md), original vocabulary-to-listening improvement plan, existing delivery log and rollout checklist. Preserve the already implemented journey and extend the existing Angular Signal Stores, API boundaries and NestJS domain/application services.

## Outcome and scope

A reviewer can find a credible conversation, preview without saving, review its words, return to the same episode after leaving/reloading, and listen with reliable playback. The product can measure this journey through server-qualified listening without compromising review progress or inflating mastery/rewards.

Implement the five stages below as small reviewable changes. Existing functionality needs verification before rewriting. Keep recommendations optional and review independently usable. Cross-device continuation, precise token-to-lexeme alignment and outbound reminders are later scope, rather than requirements for this release.

## Stage 1 — Finish the UI handoffs

Owner: frontend. Dependencies: none. Suggested change: PR 1, preview and discovery presentation.

### Work

- Carry an explicit preview intent from Home, summary and library recommendation actions. On preparation entry, expand the optional vocabulary section after its data is available, including Ionic page re-entry. Move keyboard focus appropriately; respect reduced motion. Do not trigger vocabulary preparation or playback.
- Replace interpolated English counts with existing translation conventions and correct singular/plural wording, including saved-vocabulary and pending-sync states.
- Show `Level applies to new conversations. Your unfinished episodes stay available at any level.` next to the discovery filter. Topic browsing scope must also be clear if it spans levels.
- Restore Continue listening before recommendations when there is unfinished listening. Initially show one recommendation, with an explicit action to browse more. Keep Home/summary at one recommendation and review first on Home. This is the proposed default for this delivery, subject to reviewer validation.
- Give the recommendation section a visible heading; hide an empty section instead of leaving unexplained space. Preserve generic browsing when recommendations are unavailable.

### Acceptance and verification

- One Preview click reveals focus words on desktop and 390 × 844 portrait web. Navigation/reload/re-entry honor preview intent; normal episode entry remains compact. Vault item and collection counts are unchanged.
- Copy is correct at counts 0, 1 and several, across current/pending/unavailable evidence. Check supported translations without introducing untranslated keys.
- At A2, new suggestions are A2 while existing A1 resume remains visible and explained. Completed episodes stay in replay history.
- Resume appears before discovery in visual and keyboard order. Long titles, large text and loading/error states do not obscure review or playback actions.
- Add focused route/state tests for preview intent and any section-selection logic. Verify low-impact copy/layout changes manually; avoid tests that merely repeat template text.

## Stage 2 — Close reliability, content and collection gaps

Owner: engineering plus content. Dependencies: authenticated test accounts and authorized content/database access for production tracing. Suggested changes: PR 2 for confirmed reliability fixes; PR 3 for provenance/content safeguards. Content corrections use the existing publishing workflow.

### Work

- Record frontend/backend deployed revisions and audit environment before retesting. Establish reproducible small review sessions on dedicated test accounts; leave the user's existing production review intact.
- Reproduce review exit under warm/cold navigation, slow network, failed sync and reload. Inspect visible UI and browser/network evidence together; an empty accessibility snapshot alone is not a visual blank-page bug. Fix only established root causes.
- Measure startup and review-sync latency/failure categories. Confirm pending commits survive reload and retries, and surface recoverable failure states. Set a performance budget from observed baseline before optimization.
- Trace the `to talk / speak` cue to its personal/canonical/localized source. Prefer a sense-specific cue. Introduce curated accepted alternatives only if the content model and review semantics require them; never globally accept synonyms.
- Locate the malformed `also (Meine Mutter ist Italienerin` record or classify it as not found with recorded search scope. Correct the specific source and add import/publishing validation for the proven failure pattern, without rejecting legitimate phrases.
- Trace the old `Meine neue Wohnung` collection's source episode, topic publication and playable audio. Distinguish absent provenance from legitimately unavailable content. Repair only relationships established by stored import/preparation evidence. For a necessary backfill, provide a read-only report first, an idempotent bounded update and rollback records.
- Verify collection Review and Review all both retain valid episode continuation. Keep word audio and conversation audio clearly separate.

### Acceptance and verification

- Every original reliability/content observation has one disposition: reproduced and fixed; expected behavior with evidence; or not reproduced/not found with explicit limits. Unreproduced items are not marked fixed.
- Failed sync retains pending commits; repeated successful sync does not duplicate scheduling/rewards. Exit/reload returns to usable Home or a recoverable state, with the same remaining review context.
- The ambiguous cue has an editorial decision and verified expected answer. A malformed-source fix is visible in the affected learner content and survives re-import.
- Valid published source episodes expose Play conversation; absent/unpublished sources do not. No identity is inferred from collection names. Provenance cannot expose another user's resources.
- Add regression tests at the narrowest layer for confirmed defects, retry behavior and provenance eligibility. Verify publishing/import fixes against both the bad example and valid phrases.

## Stage 3 — Make recommendations credible

Owner: backend plus product/content. Dependencies: initial canonical coverage audit; Stage 1 presentation. Suggested change: PR 4, versioned recommendation policy.

### Work

- Produce coverage by language pair and level: distinct committed reviewed lexemes, playable episode coverage, unmapped personal/legacy items, missing scheduling and missing localizations. Separate unknown evidence from unfamiliar vocabulary.
- Introduce an explicit fit classification alongside truthful raw match counts. Proposed initial strong-fit rule: at least three distinct reviewed matches and no more than half of selected focus lexemes new to the vault. These are testable product defaults, not comprehension claims or established learning thresholds.
- Below the strong-fit group, distinguish weaker vocabulary overlap from editorial starters. A one-word match remains a one-word match; supportive copy should not imply a strong personalized fit. Choose a manageable fallback where possible and keep listening available for all episodes.
- Avoid a universal stop-word blacklist: function words may be valuable learning targets. Assess low-information overlap with language-specific editorial evidence. Do not claim phrase/sense alignment until canonical content actually represents and validates it.
- Version ranking changes and preserve canonical identity, distinct counts, active language/level safety, owned-session checks, history separation, topic variety and stable ordering.
- Inspect representative query plans/latency and catalogue size. If the newest-200 candidate pool demonstrably misses useful older episodes, replace it with a bounded vocabulary-first candidate read plus bounded starter candidates. Keep reads batched and ranking pure; do not call preparation per episode.

### Acceptance and verification

- Fixtures include the observed one-function-word/high-novelty case, a manageable three-word match, zero-overlap starter, duplicate lexemes, missing scheduling, unmapped personal cards, sense-distinct lexemes and older strong matches.
- Match counts remain exact; fallback/evidence wording reflects their actual source. Wrong-language and another user's session never contribute.
- New suggestions exclude current-version listening history; resume/replay remain separate. Audio replacement preserves the existing version semantics.
- Query bounds and latency evidence are recorded. Change indexes only after observing relevant query plans.
- Product/content review checks a small real recommendation sample per supported language/level. Record exceptions instead of promising relevance solely from unit tests.

## Stage 4 — Complete measurement and rollout controls

Owner: full stack plus product. Dependencies: settled attribution definitions; Stage 3 policy version before measuring policy comparison. Suggested changes: PR 5 for attribution/reporting; PR 6 for independent switches and cohort assignment.

### Attribution implementation

- Define a typed bounded context: recommendation/exposure ID, placement, policy version, discovery level, episode ID and audio version. Persist a server-verifiable exposure/selection record tied to the authenticated user; never trust arbitrary client ownership or policy claims.
- Carry that context through Preview → preparation → review continuation → summary → player, and direct Listen → player. Scope durable context by user and episode/version and clear it on account changes. Plain catalogue/collection entry uses a truthful non-recommendation source.
- Define attribution before coding: selection establishes the originating context; resume retains the saved origin for that playback journey; a new explicit recommendation selection starts a new journey; replay gets a new playback journey while retaining origin only when explicitly chosen through that recommendation. Record unattributed activity honestly rather than inferring it from recent impressions. Preserve direct versus assisted transitions through preparation review.
- Record playback start only after actual audio play. Attach validated journey context to progress so server milestones can resolve attribution. Keep unique-range qualification and existing completion/reward idempotency unchanged.
- Retain one authoritative meaningful-listening/completion milestone per existing account/episode/audio-version semantics. Store attributed playback journeys separately if repeat-listen analysis requires them; do not duplicate canonical completion events for new selections/replays.
- Include discovery level and playback language context in bounded metadata; do not send raw vocabulary text. Verify retention/consent and deletion handling under existing application conventions.
- Keep best-effort offline telemetry explicitly documented for this release. Add a bounded idempotent offline queue only if baseline evidence shows loss makes the experiment unusable; audio progress synchronization and client telemetry have different reliability requirements.

### Reporting and controls

- Build a reproducible report for impressions → selections → actual starts → meaningful listening → completion, by placement/policy/level/cohort, distinguishing direct and assisted journeys and documenting unattributed events.
- Freeze the primary metric definition before comparing results. Report both existing 70%-plus-request completed listening and 30-second unique meaningful listening; explicitly designate which qualifies the original two-local-days weekly metric. Do not silently interchange them. Use the user's configured timezone with a documented fallback.
- Establish committed-reviewer denominators, coverage, seven-day return listening and review/sync/playback guardrails. Record baseline traffic before sample-size or duration commitments.
- Add independent Home/summary/library recommendation switches and stable server-side cohort assignment. Persist experiment versions; assignments stay stable across reload/devices. Start with internal accounts. Do not create concurrent experiments with moving assignments.
- Deploy contracts/API before dependent frontend changes, with backward-compatible absent attribution/flags. Disabled/error states preserve review and generic catalogue access.

### Acceptance and verification

- Direct Play and Preview → review → return preserve one valid attribution context; unselected impressions do not receive listening credit. Actual starts and qualified milestones link to the expected placement/policy/level.
- Forged, cross-user, wrong-episode and wrong-version contexts are rejected or treated as unattributed according to the contract, without blocking legitimate listening.
- Retry/replay cannot duplicate completion or rewards. Interrupted playback preserves validated progress; seeks do not qualify unheard ranges.
- Reported funnel rows reconcile with captured test-session events in the database. Test timezone date boundaries, denominator membership and distinct local days.
- A recommendation surface can be disabled independently. Stable cohort assignment and generic fallbacks are verified on two accounts.

## Stage 5 — End-to-end release proof, content and onboarding

Owner: engineering/QA plus content/product. Dependencies: Stages 1–4. Suggested changes: PR 7 for critical journey coverage and release evidence; PR 8 for a truthful onboarding example and coverage-driven editorial tooling if needed.

| Journey | Verification setup | Required result |
| --- | --- | --- |
| Ordinary review → recommendation → Listen | Small canonical test collection; committed session | Accurate session matches; explicit Play starts audio; attribution reaches server listening milestone. |
| Preview without saving | Capture item/collection counts before and after | Words open immediately; counts unchanged; no preparation mutation or autoplay. |
| Preparation review → original conversation | Save/review a short set | Summary prioritizes originating episode; Stories/exit remain available; no unexpected recommendation switch. |
| Leave/resume/reload | Repeat during active review and at summary | Same device restores session and episode context; pending sync copy is honest. |
| Collection bridge | Valid, missing-provenance and unpublished sources | Separate actions; valid origin preserved; unavailable source handled safely. |
| Offline and reconnect | Seed cache, then disconnect without downloaded audio | Cached metadata is identified; audio availability is separate; review remains usable; reconnect refreshes evidence. |
| Account/language switch | Two test accounts and different language contexts | No stale recommendation, continuation or attribution leakage; newer requests win. |
| Playback failure/interruption | Failed audio request, foreground/background and resume | Clear recovery; actual-play telemetry only; no false completion. |
| Replaced audio and retries | Dedicated staging episode; new audio version | Old ranges cannot qualify new audio; same-version retries preserve progress; no duplicated rewards. |
| Responsive/accessibility | Desktop, 390 × 844 portrait, landscape, 200% text, keyboard and screen reader | Main actions usable; readable subtitles/context; logical focus; no hidden focused controls. |
| Native | Physical iOS/Android where supported | Playback, interruption, screen-awake and background/resume results documented per platform. |

Use dedicated staging/test accounts for destructive playback/content scenarios. A walkthrough screenshot alone is not evidence of event persistence, native behavior or completion qualification.

After technical gates, run the original four tasks with 5–8 existing reviewers: find a relevant conversation, preview without saving, resume after vocabulary review, distinguish word audio from conversation audio. Record task success/confusion and compare the proposed resume-first library hierarchy.

Select a real published conversation for onboarding, with verified shared card/audio words. Use the coverage report to prioritize underserved reviewed-word clusters. Content publication follows editorial audio/translation/sense checks. Recruitment messages and production content publication are separate actions from preparing this plan.

## Engineering verification commands and evidence

Run focused suites for each behavioral change, then the relevant broader suite once integration is complete:

```sh
npm run test:api -- --runInBand
npx jest --config jest.config.ts --runInBand --testPathIgnorePatterns=/apps/api/
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/mobile/tsconfig.app.json --noEmit
npm run build -- --configuration=production
npm run lint
git diff --check
```

The default Jest configuration includes API files; use the separated commands above to avoid conflating browser and server test environments. Check existing lint failures against the baseline and fix every introduced failure. The web build workflow additionally needs its configured API_URL and feature flags; `build:web` rewrites the production environment file, so inspect/revert unintended generated changes. Do not print credentials in evidence.

For each change record: revision, scope, tests/build/lint results, staging and deployed revision, manual steps, expected/actual result, relevant screenshots, event/database reconciliation where applicable, and limitations. Use statuses `planned`, `implemented`, `verified in staging`, `verified live`, `blocked by access/device`, or `deferred`. Never substitute an earlier log's green test result for the current implementation's verification.

## Release gates and completion

1. UI, canonical counting and continuation tests pass; original content/reliability observations are explicitly classified.
2. Critical staging journeys pass with real API/database/audio, including attribution and idempotency. Migration behavior and representative query plans are checked.
3. Desktop/mobile/accessibility checks pass. Supported native-platform limitations are explicit before native release.
4. Internal cohort receives the API and frontend in order; persisted events and review/playback guardrails reconcile. Exercise independent switches before expanding.
5. Expand only after baseline review and reviewer feedback. Growth experiments follow stable assignments and documented sample requirements; no uplift claim is made without evidence.

Implementation is complete when Stages 1–4 and the critical technical matrix are verified for the released platforms. Editorial coverage/onboarding and reviewer validation have their own delivery evidence. Cross-device continuation, token alignment, interests and outbound reminders remain named later work; no release item disappears merely because it requires external access or a device.

Calendar estimates should follow the Stage 2 reproduction and Stage 3 coverage results. The immediate first implementation unit is PR 1; it has no production-data dependency and can be delivered while reliability/content evidence is gathered in the same programme.
