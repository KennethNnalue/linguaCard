# LinguaCard: vocabulary-to-listening improvement plan

Date: 3 October 2026  
Status: proposed delivery plan; no application changes made  
Code inspected: `a31c147`  
Primary outcome: more active card reviewers regularly listen to relevant conversations without reducing their review habit.

## 1. Product decision

Make listening the natural continuation of vocabulary practice: **“Hear the words you’re learning in a real conversation.”** Preserve card review as Home’s primary task. Use the existing podcast catalogue and player; invest first in relevance, entry points, and continuity.

The first release should deliver one coherent journey:

**Review cards → see one relevant episode and its matching words → listen immediately or preview vocabulary → return to that episode after preview → see a truthful listening recap.**

Keep Stories available. Replace the summary’s exclusive Stories promotion with a prioritized listening recommendation when a suitable match exists; retain Stories as a secondary continuation or fallback. Avoid placing two equally dominant promotions beneath an already detailed summary.

## 2. Audit scope and evidence limits

Live inspection used the existing authenticated account in Chrome at `lingua-card.app`. Across this conversation I inspected Home’s in-progress review state, resumed a typed review and checked an answer, browsed the podcast library and topic details, opened episode preparation, played and paused a conversation, opened its transcript, inspected the Vault and a podcast preparation collection, tried collection vocabulary playback, and inspected Story Studio.

Code inspection covered podcast catalogue selection, preparation, progress/completion and rewards, transcript contracts and rendering, publication checks, collection listening, review launch and session summary, relevant shared contracts, existing specs, and existing design documents.

This was an expert walkthrough, not a representative usability study. The deployed revision was not verified against the checkout. No full 50-card review was completed; summary behavior is verified from code, not a newly completed live session. The episode completion screen was read in code; I did not establish a fresh qualifying completion during this audit. Native iOS/Android, screen-reader use, and portrait mobile layouts need separate verification. Live delays and a sync-failure toast are observations, not diagnosed backend defects. No production admin content, settings, or publications were changed. Review/playback exploration can create ordinary account activity.

## 3. Current capability inventory

| Capability | Existing implementation | Product implication |
|---|---|---|
| Focused review Home | Ready, resume, complete, empty, nothing-eligible and error states in `review-home.page.html` | Add an independent listening slot without rebuilding review planning. |
| Review summary | Outcomes, rating breakdown, tricky-card drill, celebration and a Stories bridge | Existing continuation location; currently no podcast suggestion. |
| Podcast library | Level persistence, onboarding-level default, cached responses, topics, recent activity and new suggestions | Reuse this foundation; clarify the mixed sections. |
| Suggestions | Excludes episodes with activity; level filter; publication recency; topic diversity | No learned-vocabulary ranking yet. |
| Vocabulary familiarity | Canonical episode lexemes joined to user learning items and scheduling stages | Personalization is feasible without generating custom audio. |
| Preparation | Essential/supporting words, examples, pronunciation, optional collection creation, review launch | Already substantial; improve framing and return path. |
| Player | Resume, timed words, translation modes, speed, seek, repeat, transcript seeking, immersive mode | Improve discoverability and learning interactions incrementally. |
| Completion | Recap vocabulary, replay, next episode, learning points | Existing recap; lacks a focused retrieval follow-up. |
| Listening qualification | Server merges played ranges; completion requires 70% unique audio coverage plus completion request | Preserve this mechanism; progress position alone is not evidence of listening. |
| Vocabulary reuse | Preparation transaction reuses learning items and excludes familiar/strong/mastered essentials | Preserve canonical identity and deduplication. |
| Publishing | Audio approval/version checks, thumbnail and title-translation requirements; transcript resolution | Add editorial quality checks rather than rebuilding publishing. |
| Collection playback | “Listen” launches the vocabulary playlist | Add a clearly separate conversation action. |

## 4. Findings that drive the plan

### A. Relevance is calculated too late

Home has no podcast entry tailored to learned words. The library says “Picked for you,” but the server’s `selectPodcastSuggestions` only uses level, publication date, activity exclusions and topic diversity. User mastery enters at episode preparation, after the user has already chosen content.

**Decision:** calculate a small, explainable vocabulary match before episode selection and reuse it on Home, review summary and library.

### B. Listening history is presented as recommendations

The live A2-selected library displayed an A1 unfinished episode and a completed A2 episode under “Episodes for you.” `featuredEpisodes` inserts up to three recent activities before suggestions; level filtering applies to suggestions, not recent activity. Topic browsing also spans levels. This is explainable code behavior, not proof that the level filter is broken.

**Decision:** separate “Continue listening,” “Practise your words,” and a lower-priority “Recently listened.” Label the level control as applying to discovery. Preserve unfinished episodes across levels in the explicitly labeled continue section.

### C. Readiness overstates what the system knows

The inspected episode showed “4% ready” and “Learn the essential words first.” Readiness averages weights for linked focus vocabulary: new 0, learning .35, familiar .7, strong .9, mastered 1. It does not measure transcript-wide lexical coverage, grammar comprehension, or auditory recognition. Zero linked words currently produces 100% readiness.

**Decision:** use counts and supportive language. Distinguish unavailable evidence from strong familiarity. Avoid interpreting focus-word mastery as a comprehension percentage.

### D. Preparation review loses episode context

`reviewWords()` creates/reuses an episode collection and opens the generic review player. Successful completion navigates to `/review/summary`, whose bridge leads to Stories. There is no explicit episode continuation in this path.

**Decision:** carry a typed, persistent continuation descriptor through review and offer “Continue to your conversation” in the summary. Leaving review should retain a route back to the episode without forcing playback.

### E. Collection provenance is not a useful listening bridge

The live collection “Podcast · Meine neue Wohnung” offers “Listen,” but that launches pronunciation and example playback. `CollectionEntity` stores `sourcePodcastEpisodeId`; learner-facing propagation must be audited and extended so the UI can use it reliably.

**Decision:** label the existing action “Listen to words” and add “Play conversation” for valid linked episodes. Do not derive the episode from collection names.

### F. Trust and reliability need explicit follow-up

The broad cue “to talk / speak” rejected *sprechen* while expecting *reden*. The evaluator receives one expected word and article, with spelling-distance tolerance; it has no explicit accepted-alternative contract. A vocabulary entry rendered as `also (Meine Mutter ist Italienerin`; its exact content source needs tracing. A sync-failure toast and slow page loads were visible; leaving review once resulted in a blank view until navigation recovered it.

**Decision:** investigate these individually. Use sense-specific cues or curated accepted alternatives; never globally treat synonyms as interchangeable. Trace malformed vocabulary through canonical content and import validation. Reproduce navigation and sync failures before declaring root causes.

## 5. Target screen behavior

### Home

Review stays first. Place one compact recommendation between the review hero and secondary controls. On the daily-complete or nothing-due state, listening becomes the prominent optional continuation. Empty-vault users may receive an editorial starter, clearly labeled as such.

Illustrative content, with actual computed counts:

> Hear your words in a conversation  
> A café conversation · A2 · 2 min  
> Includes 6 words from your recent reviews  
> reden · Ausbildung · Stadtzentrum  
> **Listen now** · Preview words

Limit the preview to three words. Do not make the whole Home wait for recommendations. Loading, unavailable recommendations, and recommendation errors must leave review usable. Never show invented overlap counts.

### Review summary

Keep the completion celebration and essential outcomes. Promote one match before optional detailed statistics. Copy: “You practised these words. Now hear them in context.” Use “6 words from this session” only for resolved, actually reviewed words that occur in the episode.

For episode-preparation reviews, prioritize the originating episode rather than switching to another suggestion. The secondary exit remains obvious. A weak/no match falls back to an honest starter or the existing Stories bridge.

### Podcast library

Order: Continue listening → Practise your words → Explore topics → Recently listened. Show level, duration, plain-language situation, and match reason adjacent to artwork. Resume goes directly to the player; a new suggestion provides Play and Preview actions. Completed episodes remain available for replay but do not crowd out discovery.

Keep existing navigation labels for the first release. “Conversations” is useful explanatory copy; test any eventual renaming of the Podcasts tab separately.

### Preparation

Replace the readiness ring as the dominant message with “4 familiar focus words · 3 you’re learning · 5 new to you,” where applicable. Explain that these are selected words, not all words spoken. Show “Try it with translations” for challenging content. Keep listening enabled and vocabulary preview optional. Collapse the long list below a short preview.

The existing review action can add words to the vault. Make that side effect clear: “Add and review useful words.” A read-only preview must not silently create a collection. Selective addition is a later enhancement; do not describe the current batch operation as selective.

### Player and recap

Preserve existing speed, translations, transcript seeking, repeat and resume. Keep controls visible initially and while keyboard focus is within them; provide a one-time hint if they hide. Verify contrast, focus order, tap targets and subtitle size on actual mobile viewports.

Later, add “Replay sentence” and lexeme-based word interactions. The existing yellow highlight denotes playback position, not learned-word relevance. Any familiarity highlight must look different and remain understandable without color.

Recap should say “Words in this conversation” unless played ranges can establish which word occurrences the user actually heard. Offer a short optional recall activity for 2–3 matched words; playback alone never upgrades review mastery.

## 6. Recommendation design: deterministic MVP

### Eligibility and identity

Filter candidates to published episodes under published topics, usable current audio, and the active source/target language pair. `listTopics` currently loads all published topics; the recommendation path needs explicit language-context filtering. Keep level filtering as a deliberate discovery choice.

Join `podcast_episode_vocabulary.lexemeId` with the authenticated user’s `learning_items` in the relevant context, then read `review_scheduling` using `COALESCE(legacyCardId, item.id)` as the existing mastery query does. Resolve recent review card IDs through owned learning items and review commits. Do not match strings or infer mastery from collection membership.

Count distinct lexemes once. Distinguish owned/new, learning, familiar, strong and mastered. Personal cards without a canonical lexeme contribute no match in MVP; show a fallback instead. Word-sense mapping and import quality are preconditions for truthful personalization.

### Initial ranking policy

Use a transparent ordering before tuning numeric weights:

1. Valid language/level/audio candidates.
2. Prefer episodes with manageable focus-vocabulary novelty and at least three distinct matches from the current session; for Home use reviews from the last seven days.
3. Within that group, prioritize recently reviewed learning/familiar words, then total matched focus words, then short duration and topic variety.
4. Place highly unfamiliar episodes below stronger fits, even when their raw overlap count is high.
5. Exclude completed episodes from new suggestions; maintain them in Replay/Recent. Resume is a separate section and must remain available.
6. Use a stable final tie-breaker; never label zero-overlap editorial recommendations as vocabulary matches.

“Three matches,” the seven-day window and novelty grouping are initial product defaults to validate, not established learning thresholds. Missing scheduling is unknown evidence, not proof of no language knowledge. Store the policy version for analytics. Start without ML, external recommendation services, or per-user generated podcasts.

### Response contract and boundaries

Add a bounded authenticated recommendation query accepting placement (`home`, `review_summary`, `library`), level and optional owned session ID. Authenticate ownership of the session server-side. Prefer server-resolved commits; if offline client context is supported, validate card ownership and treat it as provisional context, never a mastery update.

Return episode metadata plus reason, distinct match count, up to three matched word previews, focus-vocabulary familiarity counts, evidence state (`current`, `pending_sync`, `unavailable`), policy version and recommendation ID. A recommendation’s meaning must be consistent across surfaces.

Place ranking in a pure domain function, aggregate reads in a focused data-access boundary, and orchestrate in a Nest application service. Batch candidate/mastery/recent-review reads; do not call `getPreparation` separately for each episode. Bound candidates and result counts and examine query plans before selecting new indexes.

Use a feature Signal Store and the existing API boundary in Angular. Reuse a presentational recommendation card with inputs/outputs. Keep recommendation state independent from review planning and from the catalogue’s shared loading/error state.

### Freshness and offline behavior

Invalidate/reload after successful review synchronization, vocabulary preparation, language change and podcast completion. Scope caches by user, language pair, level, placement and evidence context. Clear user-specific cache/state on logout. Avoid overwriting newer results with stale requests.

When session reviews are still pending sync, show “From your vocabulary” using available evidence or explain that recommendations will refresh. Do not say “today’s words” from stale server data. Offline mode may render cached recommendations, but playback availability must be determined separately from cached metadata. The existing metadata cache is not proof that audio is downloaded.

## 7. Delivery backlog and acceptance criteria

| Order | Work package / owner | Dependency | Acceptance |
|---|---|---|---|
| P0-A | Reliability and vocabulary audit / engineering + content | None | Reproduce or classify blank review exit, slow startup and sync failure; trace malformed vocabulary; curate ambiguous review cue. Document root causes separately. |
| P0-B | Measurement foundation / engineering + product | None | Impression, selection, playback start, qualified listening and completion distinguish placement and recommendation policy; retries and replays do not duplicate completions. |
| P1-A | Vocabulary matching service / backend | Canonical identity check | Language-safe, bounded, explainable results; current-session and recent-review matches; accurate fallback and evidence states. |
| P1-B | Home and summary recommendations / frontend + design | P1-A, P0-B | One recommendation; review remains usable during errors; direct Play and Preview; no misleading counts; Stories remains accessible. |
| P1-C | Library section separation / frontend | Existing data; enrich with P1-A | Continue and completed items no longer appear as new personal suggestions; level scope is explicit. |
| P1-D | Episode continuation + collection bridge / full stack | Typed provenance/continuation contracts | Prepare → review → summary → originating episode works; leaving/resuming preserves context; linked collection exposes separate word/conversation actions. |
| P1-E | Preparation simplification / design + frontend | Familiarity contract | Listening stays enabled; focus-word counts replace comprehension implication; read-only preview has no mutation; add-and-review side effect is clear. |
| P2-A | Listening reinforcement / full stack | Turn-to-lexeme mapping | Replay sentence; word meaning/saved state; optional recall; exposure does not alter mastery. |
| P2-B | Editorial coverage and onboarding / content + growth | Matching audit, stable P1 journey | New content fills common unmatched reviewed-word clusters; onboarding demonstrates a truthful card-to-conversation example. |
| P3 | Interests, reminders, broader discovery / product + growth | Repeat-listening evidence | Opt-in reminders target meaningful matches; user can dismiss recommendations; no repetitive unchanged nudges. |

Recommended first release: P0 measurement/reliability essentials and P1 as one complete journey. Split delivery into small PRs, but avoid launching a recommendation card that routes users into an unfinished return flow. Effort is medium for recommendation aggregation and continuation; small-to-medium for presentation changes. Calendar estimates require team capacity and data-volume checks.

## 8. Implementation map

Existing files to extend or integrate:

- `apps/api/src/podcasts/domain/podcast-suggestions.ts`: replace/extend the generic selection boundary with vocabulary-aware ranking, retaining tests for level/activity/diversity.
- `apps/api/src/podcasts/services/podcast-catalogue.service.ts`: catalogue composition and existing mastery mapping; extract focused recommendation reads rather than further concentrating unrelated behavior.
- `apps/api/src/podcasts/controllers/podcasts.controller.ts`: authenticated bounded query contract.
- `apps/api/src/podcasts/domain/podcast-readiness.ts`: truthful familiarity semantics and missing-evidence behavior.
- `libs/shared/domain/src/index.ts`: recommendation result, evidence status, collection provenance and typed review continuation contracts.
- `apps/mobile/src/app/features/review/pages/review-home/`: optional recommendation placement across existing states.
- `apps/mobile/src/app/features/review/pages/session-summary/`: recommendation and originating-episode continuation alongside existing outcomes/Stories.
- `apps/mobile/src/app/features/review/services/review-player.service.ts` and review persistence: continuation lifetime; avoid hardcoded podcast routing inside generic review domain rules.
- `apps/mobile/src/app/features/podcasts/store/podcast-catalogue.store.ts`: separated library groups and freshness; keep independent recommendations from blocking catalogue/preparation state.
- `apps/mobile/src/app/features/podcasts/pages/podcast-preparation/`: clearer actions and resumed preparation refresh.
- `apps/mobile/src/app/features/vault/pages/collection-detail/` and API collection mapping: expose source episode, explicit conversation route.
- `apps/api/src/podcasts/entities/podcast-turn.entity.ts`: existing turn `vocabularyKeys` can seed sentence-level mappings, but player response does not currently expose them.
- `apps/mobile/src/app/features/podcasts/components/podcast-transcript/` and player: later contextual interactions.

Player word timings contain text/start/end, not lexeme IDs. Do not promise precise tap-to-lexeme alignment from this contract. Start with validated turn-level references; token-level interactions need explicit mapping, including inflections and multiword expressions.

Existing platform-vocabulary publishing service and its specification remain relevant to editorial distribution; do not duplicate that workflow. Existing design docs contain proposed and older behavior, so executable code is the source for current capability claims.

## 9. Measurement and experiments

No general product analytics implementation was found in the inspected runtime directories using common vendor/event names. Some epics mention analytics; that is not evidence that the funnel is deployed. Confirm any externally configured measurement before choosing a provider.

Primary weekly metric: **active reviewers who qualify listening on at least two distinct local dates / active reviewers**. Define active reviewer as a user with at least one committed card review that week. Use the user’s configured timezone. If measuring partial sessions, separately define meaningful listening as at least 30 seconds of unique played audio (or all available duration for shorter clips); do not confuse it with the existing completion rule.

Supporting metrics: recommendation impression-to-play rate, qualified listening per impression, completion per start, seven-day return listening, review-to-listen transition, and recommendation coverage among active reviewers. Guardrails: review completion, review frequency, playback failures, preparation abandonment, sync failures and overall returning-user activity.

Events: `podcast_recommendation_impression`, `podcast_recommendation_selected`, `podcast_playback_started`, `podcast_meaningful_listening`, `podcast_completed`, `podcast_preview_opened`, `podcast_preparation_review_started`, `podcast_preparation_review_returned`. Include recommendation ID, placement, episode ID, policy version and level; avoid raw user vocabulary text. Count impressions only when visibly rendered; playback starts only after actual audio play. Keep reward/completion analytics server-authoritative.

Experiment sequence:

1. Validate the proposed wording and journey with 5–8 existing reviewers. Tasks: find a conversation using reviewed words, preview without adding, resume after review, distinguish word audio from conversation audio.
2. Compare vocabulary-based recommendations with current generic suggestions using stable user assignment and the same content pool.
3. Then test Home placement and summary placement separately so their contributions are identifiable.
4. Compare count-based supportive preparation with the current readiness framing.

Set experiment duration and required sample from the baseline traffic before rollout. Do not promise a percentage uplift without that baseline. With low traffic, use staged rollout, interviews and directionally useful funnel evidence rather than premature significance claims.

## 10. Verification and release gates

Required behavior tests: canonical matching/sense isolation; wrong-language exclusion; duplicated lexemes counted once; partial/legacy unmapped cards; missing scheduling; no linked vocabulary; current-session ownership; completed/in-progress treatment; diversity; stable ordering; pending sync; stale caches; latest-response protection; and recommendation failure not blocking review.

Critical integration journeys: ordinary review → matching episode; preparation review → original episode; leave/resume/reload review; linked collection → conversation; offline cached recommendation without audio; language switch; published audio-version change; completion/reward retry.

Preserve existing unique-range completion semantics, idempotent preparation and reward behavior. Inspect old progress when audio versions change before changing any completion logic; this is a verification requirement, not a diagnosed defect in this plan.

Manual verification: Chrome desktop plus portrait mobile web, native iOS/Android where supported, keyboard/screen reader, large text, long titles, slow network and playback errors. A read-only preview must not grow the vault. No new recommendation should impose review work or autoplay without the user’s Play action.

Release behind a flag. Ship contracts/API before frontend activation. Retain fallback catalogue browsing and the existing review flow on recommendation errors. Activate for a small cohort, check funnel and guardrails, then expand. Disable recommendation surfaces independently if reliability degrades.

## 11. Marketing and content direction

Position the combined experience as **“Learn a word. Hear it in a real conversation.”** In explanatory copy, emphasize short everyday conversations at the learner’s level. Avoid implying access to an external podcast catalogue when these are LinguaCard-authored/generated dialogue episodes.

Demonstrate the loop in onboarding and product previews with the same actual words appearing in cards and audio. Build editorial episodes around clusters that many users review but cannot yet find in listening content. The audited account saw three topics with small episode counts; this is a limited observed catalogue, not proof of all available production content or languages.

Defer paid acquisition aimed specifically at listening until the first-listen and return-listen paths are reliable. Use opt-in email/push only after the in-app loop works, with an actual match and short duration as the message’s reason. This plan authorizes no outbound campaign or notification subscription changes.

## 12. Open implementation decisions

- Confirm active language-context source for discovery; do not assume global profile level is sufficient.
- Inspect canonical mapping coverage across imported and personal cards before setting match expectations.
- Confirm server review-commit freshness and durable continuation storage for offline/reload cases.
- Confirm analytics provider and consent conventions already used outside the inspected code.
- Establish traffic baseline, target cohort and editorial capacity before scheduling experiments or dates.

These are discovery tasks for implementation, not blockers to the product direction. The core recommendation remains: make relevance visible before selection, remove preparation pressure, and preserve the connection between vocabulary review and its conversation.
