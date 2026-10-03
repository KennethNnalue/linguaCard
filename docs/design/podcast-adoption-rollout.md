# Podcast adoption release and evidence checklist

This accompanies the implementation plan and delivery log. Application code is implemented for the review-to-listening journey; the following evidence-dependent work remains a release programme, not a claim of demonstrated adoption uplift.

## Deploy and activate

1. Deploy the API first. Its normal startup migration creates `podcast_events`; test migration application and rollback on a staging database copy before production.
2. Verify authenticated recommendations with two accounts and different active language pairs. An account must not receive another account's reviewed vocabulary or continuation.
3. Build the frontend with `PODCAST_RECOMMENDATIONS_ENABLED=true` using `npm run build:web`. Without this variable, production recommendation surfaces remain disabled. Existing catalogue/preparation/player changes are not gated by this flag.
4. Start with internal accounts or a restricted deployment. The present flag is build-wide, not percentage-based or remotely configurable; implement stable cohort assignment before a concurrent controlled experiment.
5. Check recommendation query plans and latency at representative volume. Candidate selection is bounded to the newest 200 playable published episodes; a large catalogue may need a vocabulary-first candidate query.
6. Preserve browsing and review if recommendations fail. Turn off the build flag if relevance, sync or playback guardrails degrade.

## Measurement definitions

Server events are authoritative for meaningful listening and completion. Unique played ranges qualify meaningful listening at 30 seconds, or the entire duration of a shorter recording; completion retains the existing 70% rule and explicit completion request. Milestones deduplicate by account, episode, audio version and milestone. Rewards retain existing episode-level deduplication.

Client impressions require a visible card; selections distinguish preview and play; playback starts follow actual audio playback. Client requests have unique event IDs. Delivery is best effort and not buffered offline: report the resulting measurement gap rather than treating missing events as proof of no activity. The API deliberately accepts only bounded metadata, without vocabulary text. Check account deletion cascades and apply the product's existing consent/retention policy before rollout.

The primary weekly metric is committed reviewers who qualify listening on at least two distinct dates in their configured timezone divided by committed reviewers. Supporting metrics: impression-to-start, meaningful listening per impression, completion per start, seven-day return listening, preparation-review return and recommendation coverage. Guardrails: committed review sessions, review frequency, sync failures, playback failures and overall return activity. Establish the baseline and denominators before judging improvement.

## Editorial coverage and truthful onboarding

Audit canonical matching by active language pair and level. Count distinct reviewed lexeme IDs, mapped IDs in playable published episodes, unmapped personal/legacy cards, missing scheduling and unavailable localizations separately. A missing canonical identity is not evidence that the user has never learned the word.

Prioritise frequently reviewed canonical word clusters with few playable episode matches. Draft short everyday conversations around those clusters; use the existing transcript manifest, vocabulary import, audio approval and platform publishing workflows. Validate senses and multiword expressions, translated cues, focus-word references, thumbnails and final audio. Never publish generated content without editorial review.

The library now explains “Learn a word. Hear it in a real conversation.” Recommendations show actual mapped vocabulary from the learner's context. For onboarding and public previews, select a real published episode and show the same words on cards and in its audio; do not use a simulated match as a testimonial or claim an external podcast catalogue.

The observed malformed headword and broad “to talk / speak” cue were not found in repository fixtures. Trace their production lexeme/localization and card provenance in an authorised content audit. Fix the specific canonical entry or cue through the publishing workflow; do not globally accept synonyms or rewrite unrelated vocabulary.

## Journey checks before activation

- Ordinary review → matching recommendation → explicit Listen → actual audio play.
- Preparation → read-only word preview: vault item count unchanged.
- Add/review → leave → Home resume → summary → originating episode; repeat after reload on the same device.
- Podcast-linked collection → review → originating episode, with separate word-audio and conversation actions.
- Cached recommendation offline without downloaded audio: explain connection requirement; review stays usable.
- Active language switch and account switch; stale responses must not overwrite current evidence.
- Audio-version replacement: old ranges/completion must not qualify the new recording; repeated current-version completion must not award duplicate points.
- Desktop Chrome and portrait mobile web; keyboard, screen reader and large text; long titles; slow network and storage/audio failures.
- Native iOS/Android device playback, interruption, screen-awake and background/resume behavior.

Local fixture visual checks are not authenticated end-to-end or native-device evidence. Review continuation is device-local; cross-device recovery needs a separate server contract.

## User validation and later growth

Recruit 5–8 existing reviewers for the four tasks in the plan: find a relevant episode, preview without adding, resume after review and distinguish word audio from conversation playback. Record confusion and task success before choosing experiment variants.

Compare vocabulary recommendations with generic suggestions using stable user assignment and the same content pool. Then isolate Home/summary placement and preparation wording tests. Set duration/sample requirements from real traffic. With low traffic, prioritise staged rollout and interviews.

Interest controls, opt-in reminders and broader discovery remain conditional on repeat-listening evidence. No notifications, subscriptions, email campaigns or paid acquisition were activated by this implementation. Reminders should reference a meaningful fresh match, allow opt-out/dismissal and avoid unchanged repeated nudges. Establish notification consent and delivery ownership before implementing them.
