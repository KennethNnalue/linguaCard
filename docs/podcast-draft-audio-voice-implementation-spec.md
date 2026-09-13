# Podcast drafts, deferred audio, and voice variety — implementation spec

Status: implemented in repository · 13 September 2026  
Scope: admin podcast production in the NestJS API and Angular/Ionic app

## Goal

An admin can save an episode draft under a topic, leave it, reopen it, prepare or replace its transcript and artwork, generate audio on demand, listen to the audio, and publish only when it is ready. Each new episode receives a suitable, varied set of male and/or female voices for its target language. Audio retries retain the episode's selected voices unless the admin explicitly asks for a new cast.

## Current behavior

1. `POST /admin/podcast-topics/:topicId/episodes` reserves an episode in `queued` and starts transcript generation asynchronously. The admin's new-episode form calls this path; it requires at least one vocabulary item. This does **not** generate audio. `POST /admin/podcast-topics/:topicId/episode-drafts` separately reserves an empty `draft`, but the UI invokes it only as a hidden prerequisite to copying a prompt or uploading transcript JSON. Its DTO contains only `requestId`, so it does not save entered title, direction, or vocabulary.
2. Episodes are listed under their topic, including unpublished episodes. Clicking an episode opens transcript work if no transcript exists, or review if one exists. A committed transcript sets status to `draft`, increments `contentVersion`, and clears any old audio. The review page already offers **Create audio** and **Create new audio version**, plus audio playback, before **Publish episode**.
3. `POST /admin/podcast-episodes/:episodeId/generate-audio` is admin guarded and works on an existing unpublished episode. The service requires a saved transcript, turns/speakers, and episode artwork. It calls ElevenLabs Text to Dialogue with timestamps, then forced alignment, uploads MP3, saves turn and word timings, increments `audioVersion`, and changes status to `ready_for_review`. Publishing additionally requires title translation. Topic publishing requires topic artwork and one published episode.
4. The UI's transcript confirmation is local component state (`transcriptReviewed`), not persisted. It is reconstructed as true only if audio exists or the episode is published. An admin reopening an unaudioed draft must confirm again. This is an editorial gate, not an API invariant.
5. Voice configuration accepts comma-separated female and male IDs. If those lists cannot cover all speakers, the adapter fetches only the first page of `GET /v2/voices` and uses voices with a male/female label. Selection always takes the **first** unused matching ID, so the same pair is chosen across episodes. Transcript speaker `voiceId` is stored and returned but ignored by the audio generator. The selected IDs are not saved after generation.
6. A separate ElevenLabs Studio podcast-project endpoint exists, but its project ID does not feed the episode MP3, timing, or publish path. Keep it out of the draft-audio workflow.

The platform-collection admin screen is the useful UX reference: it lists saved drafts, exposes audio readiness and a later **Prepare audio** action, and keeps publishing separate. Podcast already has most of the API separation; it needs a first-class draft action, durable production state, and more deliberate voice selection.

## Target workflow

```text
Topic → Save episode draft → Prepare/import transcript → Review transcript
      → Upload artwork → Generate audio → Listen/approve → Publish episode
```

- **Save episode draft** is an explicit primary action on the new-episode screen. It persists optional title/translation, direction, and vocabulary without calling the transcript or audio provider. A usable default title may remain `Episode N`.
- On save, navigate to the persisted episode transcript workspace. The topic list shows `Draft`, `Transcript generating`, `Audio generating`, `Audio needs attention`, `Ready to publish`, or `Published`, derived from durable server fields. Admins can reopen every draft directly.
- The draft workspace offers **Generate transcript** or **Import transcript**. Those actions work on the same episode ID and use the saved draft input, with edits explicitly saved before starting generation. Automatic transcript generation is an optional action, not an unavoidable consequence of creating a draft.
- After a transcript exists, the review screen shows its speakers, artwork and audio status. **Generate audio** is available for the persisted draft when transcript and artwork are ready. Show the provider failure and a **Retry audio** action without making the draft disappear. Audio can be regenerated before publication.
- The admin listens and explicitly confirms the current audio version before publishing. If an approval step is desired as a hard rule, store `approvedAudioVersion`; otherwise remove the misleading “reviewed” claim from the server error and make listening a clearly labeled editorial step. This spec adopts persisted approval.
- Publishing is the only transition that makes an episode available to learners. An audio regeneration, transcript replacement, or voice recast of a published episode requires an explicit unpublish/edit workflow; the current audio service already rejects published episodes.

## API, state, and persistence changes

| Concern | Proposed contract |
| --- | --- |
| Create draft | Extend `POST .../episode-drafts` to accept `requestId`, optional title, title translation, direction, and normalized vocabulary. Preserve request-ID idempotency. Return the episode and its saved input. |
| Edit draft input | Add `PATCH /admin/podcast-episodes/:id/draft-input` for metadata/direction/vocabulary before transcript generation. Keep metadata-only edits on the existing episode patch endpoint. Reject draft-input changes while transcript/audio work is active or after publication. |
| Transcript generation | Add an explicit `POST .../:id/transcript/generate` or queued equivalent using persisted input. Do not create a second episode. Keep transcript versioning and old-audio invalidation when content changes. |
| Audio generation | Keep `POST .../:id/generate-audio`, but make it return `202` with the current episode/job status if moved to background processing. Add a read endpoint or expose generation phase in the existing admin topic list for polling. Duplicate starts return the same active job or `409`; never run concurrent audio for one episode. |
| Audio approval | Add `PATCH .../:id/audio/approve` with expected `audioVersion`. Persist `approvedAudioVersion` (nullable) and clear it whenever audio or transcript changes. Publish requires the current version to be approved. |
| Episode state | Keep editorial `status` (`draft`, `ready_for_review`, `published`, plus existing transcript states) separate from `audioGenerationStatus` (`idle`, `generating`, `failed`). Add an audio attempt ID or job record and an error field. Do not reuse generic `generating` for audio. |
| Voice assignment | Persist a `voiceId` for every podcast speaker when a cast is chosen and a cast version or assignment timestamp on the episode. Explicit transcript-supplied IDs are honored after validation. Regeneration uses persisted IDs; **Choose new voices** clears/reassigns the cast only for unpublished episodes and invalidates approval. |

Avoid holding a database transaction open during ElevenLabs calls. Claim a generation attempt atomically, run the provider outside the transaction, then commit only if `episodeId`, attempt ID, transcript fingerprint/content version, and current status still match. On failure retain a previously usable audio URL and its `ready_for_review` state; record the new attempt error separately. On success replace the URL and delete the superseded object after commit. A transcript import during active audio generation should be rejected or invalidate the attempt safely. Separate transcript queue recovery from audio jobs: current bootstrap turns **all** `generating` episodes into `queued`, even if that value came from audio generation, which can misroute them to transcript generation.

Public catalogue queries must continue to filter to published topics/episodes. An unpublished draft with audio must remain admin-only. Add migrations for the saved draft input, audio attempt/approval state, and any voice assignment metadata; backfill existing drafts without changing their publication status or playable audio.

## ElevenLabs voice catalogue and selection

ElevenLabs' [List voices API](https://elevenlabs.io/docs/api-reference/voices/search) supports `gender`, `language`, `voice_type`, `collection_id`, up to 100 results per page, and `has_more`/`next_page_token` pagination. Gender and language are voice labels; the [Voice Library guide](https://elevenlabs.io/docs/eleven-creative/voices/voice-library) says a voice trained for the target language generally performs best and that community-library API access is unavailable on the free tier. The [Text to Dialogue with timestamps API](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps?explorer=true) accepts a `voice_id` per input, allows at most 10 distinct voice IDs and recommends at most 2,000 total characters per request. Those limits match the current audio path.

Use a **curated, account-available pool** for production. Editors can audition male and female voices in ElevenLabs, save library voices to the account where needed, and store approved voice IDs with language, gender, display name, and active flag in app configuration or a small database table. The [Add shared voice API](https://elevenlabs.io/docs/api-reference/voices/voice-library/share) can save an approved shared voice to the account. Do not assume every voice returned by a public library search is immediately usable by the project's API key. Verify configured IDs through `GET /v2/voices` or [Get voice](https://elevenlabs.io/docs/api-reference/voices/get), and validate label, language suitability, account access, and model compatibility before adding them to the pool.

For each episode, build candidates for each transcript speaker's gender and the topic target language. Honor an explicit speaker voice ID if valid; otherwise draw randomly from the approved pool, without reusing one ID for two speakers in the same episode. Prefer a voice pair absent from the most recent N episodes in that language; if the pool is small, relax that preference but still choose among eligible IDs. Assign once per episode and persist before provider generation so retries use the same cast. Do not pick again on every request or rely on the order of ElevenLabs' response. If a required gender/language pool is empty or too small for the speaker count, return a clear actionable error; never silently substitute another gender or unrelated language. Provide an admin **Choose new voices** action and show chosen names/IDs before generating. No learner-facing voice chooser is needed.

The current `GET /v2/voices?page_size=100` fallback misses later pages and does not filter language; replace it with paginated discovery for a catalogue-management/sync operation, not a fresh search for every audio attempt. Cache for a bounded period and handle withdrawn or inaccessible voices as a specific failure. The current configured `ELEVENLABS_FEMALE_VOICE_IDS` and `ELEVENLABS_MALE_VOICE_IDS` can be an initial pool for one language, but cannot represent suitability across all seven supported podcast target languages by themselves.

## Delivery slices and acceptance checks

1. **Draft workflow:** extend DTO/entity/shared model, create and edit saved draft input, add explicit UI action and resume route. Test create without provider calls, idempotent request ID, saved fields after reload, draft visibility only to admins, and generation on the same ID.
2. **Audio lifecycle:** separate transcript/audio phases, implement a safe claim/commit with stale-attempt handling, persist approval, update API/store/UI with progress, retry, playback, and publish gating. Test missing transcript/artwork, duplicate starts, provider and alignment failures, restart recovery, old-audio preservation, version invalidation, and published-episode rejection.
3. **Voice variety:** establish approved language/gender pools, paginated sync/validation, randomized non-repeating assignment, persisted cast and explicit recast. Test repeated episodes vary when the pool allows it; same-episode speakers differ; retries retain IDs; explicit IDs are honored; unavailable or insufficient pools fail clearly.
4. **Operational review:** verify ElevenLabs plan/access and quota with the real project key in a non-production environment, audition several approved voices per supported language/gender, generate two sample episodes, inspect pronunciation and timing, then document the initial curated IDs. No specific voice IDs or available counts are asserted here because account inventory was not accessible during this audit.

## Code touchpoints

- API controller/DTO: `apps/api/src/podcasts/controllers/admin-podcasts.controller.ts`, `apps/api/src/podcasts/dto/admin-podcast.dto.ts`
- Draft and generation: `apps/api/src/podcasts/services/admin-podcasts.service.ts`, `podcast-episode-creation.service.ts`, `podcast-transcript-import.service.ts`, `podcast-audio-generation.service.ts`
- Voices: `apps/api/src/podcasts/infrastructure/elevenlabs-dialogue.adapter.ts`, `apps/api/src/podcasts/entities/podcast-speaker.entity.ts`, `apps/api/src/config/ai.config.ts`
- Shared contract and UI: `libs/shared/domain/src/index.ts`, `apps/mobile/src/app/features/admin/podcasts/{data-access,store,pages}`
- Reference workflow: `apps/mobile/src/app/features/admin/pages/admin-import/admin-import.page.html`

This spec is based on repository inspection and the linked ElevenLabs documentation. It does not claim that the configured account presently has a particular set of voices or API plan.

## Implementation and operations

The implemented audio endpoint remains synchronous. It keeps a separate durable audio-attempt ID and status so an interrupted attempt can be retried without conflicting with transcript recovery. The admin API reports attempts older than five minutes as timed out and permits a new attempt. The review screen has explicit draft, audio, approval, and voice-recast actions.

To use varied voices, save several male and female voices suitable for each target language in the ElevenLabs account. `GET /v2/voices` discovery uses the account's saved voices, filtered by the episode's language and paginated. A one-hour in-process cache avoids fetching the catalogue for every attempt. `ELEVENLABS_VOICE_POOLS_JSON` can define curated per-language pools, for example `{"de":{"female":["voice-id-1","voice-id-2"],"male":["voice-id-3","voice-id-4"]}}`. The older gender-only variables remain a fallback where no language-specific pool exists. New episodes prefer a cast different from the most recently generated episode in the same language, then relax that preference when the pool is too small. The code cannot guarantee variety when the account or configured pool contains only one eligible voice per gender; in that case the admin must add more approved voices.

Account-specific voice inventory, provider billing access, and live audio quality still require validation with the project's ElevenLabs credentials. No production credentials were used in this implementation.
