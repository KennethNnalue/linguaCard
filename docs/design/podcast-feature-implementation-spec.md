# LinguaCard Podcast Feature — Screen and Implementation Specification

Status: proposed  
Change type: feature  
Primary clients: Angular/Ionic mobile application and NestJS API  
Design basis: existing LinguaCard Story Studio and platform collection import patterns

## 1. Product goal

Podcast topics group short, real-world dialogue episodes. Each episode helps a learner prepare its focus vocabulary, listen with synchronized dialogue and translations, and carry the encountered vocabulary into the existing LinguaCard learning system without creating duplicate vocabulary.

An episode must be no longer than five minutes. The recommended editorial target is two to four minutes, two speakers, and 8–15 focus vocabulary items.

## 2. Terminology and ownership

- **Topic**: an ordered series of episodes about one real-world situation, such as “At the café”. Topics are platform-owned editorial content.
- **Episode**: one manually authored, versioned conversation within a topic.
- **Turn**: one speaker's uninterrupted dialogue line and its manual translation.
- **Focus vocabulary**: vocabulary deliberately taught in an episode and linked to canonical LinguaCard lexemes where possible.
- **Readiness**: a user-specific derived assessment calculated from the mastery of focus vocabulary.
- **Preparation collection**: an optional user collection containing only episode vocabulary the learner chooses to learn.
- **Topic thumbnail**: the required series-level scene image used whenever the topic is represented.
- **Episode thumbnail**: the required episode-specific scene image depicting the conversation and used in every episode listing and throughout playback.

Opening an episode never silently adds vocabulary to a user's vault.

Topic and episode thumbnails are independent assets. An episode may not inherit the topic thumbnail at publication time: the topic image communicates the broader situation, while the episode image must communicate that episode's specific conversation scene.

## 3. Thumbnail content and display rules

Every published topic and episode requires an admin-provided thumbnail image.

Image intent:

- Show the people, place and physical situation of the conversation.
- Make the communicative context understandable before the learner presses play.
- Avoid permanently baking transcript text, translations, playback controls or branding into the image. LinguaCard renders those as accessible UI overlays.
- Avoid critical visual information near the edges because cards and players use different responsive crops.

Asset requirements:

- Accepted uploads: JPEG, PNG and WebP.
- Maximum source file size: 5 MB.
- Recommended source aspect ratio: 16:9, minimum 1280 × 720.
- Minimum accepted dimensions: 960 × 540.
- Store an administrator-supplied accessibility description for meaningful full-size uses.
- Store an optional normalized focal point (`0..1` x/y) so responsive `object-position` preserves the scene subject.
- The backend validates declared MIME type, decoded file type, dimensions and file size.
- The backend generates optimized responsive variants rather than serving the original upload to every client.

Display contract:

- Topic thumbnail: podcast library topic cards, topic header, continue/recommendation surfaces and admin topic lists/editors.
- Episode thumbnail: topic episode rows, episode preparation, recent/continue episode surfaces, player/full-screen background, completion/next-episode surfaces and admin episode lists/previews.
- Text and translation remain HTML UI layered over or adjacent to the image. They are not extracted from or embedded into the asset.
- Listing images are decorative when the adjacent visible title provides the same identity; full scene images use the stored accessibility description.
- All image surfaces define an aspect ratio to prevent layout shift and use a neutral tokenized placeholder only during loading or failure.

## 4. Information architecture

### Learner routes

```text
/podcasts
/podcasts/topics/:topicId
/podcasts/episodes/:episodeId
/podcasts/episodes/:episodeId/player
/podcasts/episodes/:episodeId/complete
```

Podcast discovery should be exposed from the existing Listen area initially. A dedicated bottom tab should only replace an existing tab after usage evidence supports it; adding a sixth tab is not part of the MVP.

### Admin routes

```text
/admin/podcasts
/admin/podcasts/topics/new
/admin/podcasts/topics/:topicId
/admin/podcasts/episodes/new?topicId=:topicId
/admin/podcasts/episodes/:episodeId/preview
```

## 5. Screen specifications

### 5.1 Podcast library

Purpose: help learners resume an episode or choose a real-world topic.

Content:

- “Real-world listening” eyebrow and Podcasts title.
- Search action.
- Continue-listening hero using the current episode thumbnail when resumable progress exists.
- Topic cards using their topic thumbnails and showing title, level range, episode count and total duration.
- Recently played episodes using their episode thumbnails.
- Loading, empty, offline and pagination states.

Interactions:

- Selecting a topic opens its detail screen.
- Resume opens the player at the persisted position.
- Search filters server-backed catalogue results; newest query wins.

Accessibility:

- Topic cards expose a single descriptive accessible name.
- Level is expressed as text, not color alone.
- Continue progress exposes an accessible percentage or remaining time.

### 5.2 Topic detail

Purpose: explain the learning outcome and expose the ordered episode series.

Content:

- Topic thumbnail as the header scene, plus title, description and level range.
- Ordered episode list.
- Episode thumbnail, number, duration, focus vocabulary count and CEFR level.
- User-specific status: new, readiness percentage, in progress, or completed.

Interactions:

- Select an episode to open episode preparation.
- Completed episodes remain replayable.
- The list order comes from the server and is never inferred from publication date.

### 5.3 Episode preparation

Purpose: let the learner decide whether to prepare vocabulary or listen immediately.

Content:

- Episode title, topic, number, duration and level.
- Episode thumbnail displayed before the readiness summary.
- Readiness ring and plain-language recommendation.
- Known/new vocabulary breakdown.
- Essential focus vocabulary first, followed by supporting vocabulary.
- Two actions: `Learn N words` and `Listen now`.

Readiness calculation:

```text
mastered = 1.00
strong   = 0.90
familiar = 0.70
learning = 0.35
new      = 0.00

readiness = sum(focus word mastery weights) / focus word count
```

Recommendation bands:

- 80–100%: ready to listen.
- 50–79%: recommend reviewing the unknown essential items.
- Below 50%: recommend learning essential items first.

Readiness is a domain calculation returned by the API. The Angular client renders it but does not recalculate business thresholds.

Vocabulary behavior:

- Existing lexemes retain the user's current mastery and scheduling state.
- `Learn N words` presents only selected new/low-mastery items.
- Confirmation creates or reuses an episode preparation collection and attaches canonical learning items idempotently.
- `Listen now` is always available.

### 5.4 Podcast player

Purpose: provide focused listening with speaker-aware karaoke dialogue.

Content:

- Episode thumbnail as the full-screen conversation scene, with topic and episode identity layered safely over it.
- Speaker turns with stable speaker labels and visual identity.
- Active turn highlight.
- Word highlight when word timings exist; turn highlight otherwise.
- Optional manual translation for each turn.
- Timeline, elapsed/remaining time, play/pause, five-second rewind and repeat-turn.
- Playback speed and translation mode.

Full-screen composition:

- The episode scene occupies the visual background or upper media region.
- The current target-language turn and manual translation appear in a high-contrast overlay independent of the image.
- The transcript overlay uses a scrim or opaque surface that meets contrast requirements regardless of image brightness.
- On compact screens the transcript and controls take priority; the image may crop but must retain the stored focal point.
- Karaoke highlighting must never depend on text already present in the uploaded image.

Player behavior:

- Persist progress at meaningful intervals, on pause, on backgrounding and on route exit.
- Do not issue a progress write on every audio time update.
- Resume position is clamped to the current audio duration.
- A changed `audioVersion` invalidates a saved byte position if the new duration makes it unsafe.
- Translation modes are target only, target plus translation, and reveal-on-tap.
- Player state is route-scoped and reset when `episodeId` changes.

### 5.5 Completion

Purpose: close the learning loop without making a short episode feel like a long lesson.

MVP content:

- Completion confirmation.
- Focus words encountered.
- Replay and next episode actions.
- Optional two-to-four question comprehension check.
- Episode thumbnail in the completion header and next-episode preview.

### 5.6 Admin topic library

Purpose: manage topic structure and begin topic or episode creation.

Content:

- Published and draft topic counts.
- Search and status filters.
- Topic rows with topic thumbnail, episode count, level range and publication status.
- Primary actions: `Add episode` and `New topic`.

Interactions:

- `Add episode` starts the episode wizard and asks whether to use an existing topic or create a new one.
- `New topic` opens the topic form directly. After creation, its detail screen offers `Add first episode`.
- A topic cannot be published with zero published episodes.
- Archiving is preferred to destructive deletion after learner progress exists.

### 5.7 Add episode wizard

The wizard has three stages.

#### Stage 1: topic placement

Two mutually exclusive modes:

1. **Existing topic**
   - Search/select any accessible published or draft topic.
   - Default placement is at the end.
   - Admin may choose an insertion position.

2. **Create new topic**
   - Enter title, learner-facing description, topic key, level range and cover configuration.
   - Upload a required topic thumbnail, enter its accessibility description and optionally adjust the focal point.
   - Topic and episode are committed as drafts in one database transaction after the episode import is accepted.
   - Cancelling before import does not leave an empty topic behind.

#### Stage 2: transcript upload and validation

- Accept structured JSON only for the MVP.
- Upload the required episode thumbnail separately from the JSON so image validation and replacement do not change the transcript fingerprint.
- Validate schema, speaker references, translations, duration estimate, focus vocabulary references and duplicate external IDs.
- Preview the episode thumbnail at card, row and full-player crops before generation.
- Resolve vocabulary and show reused, new and unresolved counts.
- Show normalized episode order before any paid generation.
- Allow file replacement.

#### Stage 3: preview and generation

- Show dialogue, speakers, translations and vocabulary matches.
- Show the final topic and episode thumbnails with their storage readiness.
- Admin explicitly selects `Generate audio`.
- Generation moves through queued, generating, aligning, storing, ready-for-review or failed states.
- Admin listens to the result before publishing.
- Failed generation preserves the validated draft and supports idempotent retry.

## 6. Angular architecture

### 6.1 Feature shape

```text
apps/mobile/src/app/features/podcasts/
├── pages/
│   ├── podcast-library/
│   ├── podcast-topic/
│   ├── podcast-episode/
│   ├── podcast-player/
│   └── podcast-complete/
├── components/
│   ├── podcast-topic-card/
│   ├── podcast-episode-row/
│   ├── podcast-scene-image/
│   ├── episode-readiness/
│   ├── episode-vocabulary-list/
│   ├── podcast-transcript/
│   ├── podcast-turn/
│   └── podcast-player-controls/
├── state/
│   ├── podcast-library.store.ts
│   ├── podcast-episode.store.ts
│   └── podcast-player.store.ts
├── domain/
│   ├── podcast-readiness.models.ts
│   └── podcast-timing.ts
├── data-access/
│   └── podcast-api.service.ts
└── services/
    └── podcast-audio-engine.service.ts
```

```text
apps/mobile/src/app/features/admin/podcasts/
├── pages/
│   ├── admin-podcast-topics/
│   ├── admin-podcast-topic-editor/
│   └── admin-podcast-episode-import/
├── components/
│   ├── podcast-topic-placement/
│   ├── podcast-thumbnail-upload/
│   ├── podcast-thumbnail-crop-preview/
│   ├── podcast-import-preview/
│   └── podcast-generation-status/
├── state/
│   ├── admin-podcast-topics.store.ts
│   └── podcast-import.store.ts
└── data-access/
    └── admin-podcast-api.service.ts
```

### 6.2 Component responsibilities

- Route components are containers. They parse route state, inject the route-scoped Signal Store, render state and forward user intent.
- Presentational components use signal inputs/outputs and `OnPush`. They do not inject stores, API services or business services.
- The audio engine owns `HTMLAudioElement`, Media Session/browser events and time updates. It does not perform HTTP orchestration.
- `PodcastSceneImageComponent` owns responsive image rendering, focal-point positioning, loading/error presentation and accessible/decorative image behavior. It does not choose which asset belongs to an entity.
- `PodcastThumbnailUploadComponent` owns file selection and local preview only. Validation results and upload orchestration belong to the admin import store and API.
- API services own HTTP only.
- Readiness thresholds and vocabulary eligibility remain server-side domain rules.

### 6.3 Signal Store boundaries

`PodcastLibraryStore` is feature-scoped and owns:

- catalogue request state;
- topic cards and continue-listening summary;
- search/filter request input;
- pagination.

Intent methods:

```text
loadLibrary()
searchTopics(query)
loadNextPage()
refreshLibrary()
```

Use `switchMap` for search and route-driven reads because only the latest result matters.

`PodcastEpisodeStore` is route-scoped and owns:

- selected episode response;
- readiness response;
- preparation collection mutation state.

Intent methods:

```text
openEpisode(episodeId)
prepareSelectedVocabulary(lexemeIds)
retryEpisodeLoad()
resetEpisode()
```

Use `exhaustMap` for preparation submission to prevent duplicate collections/items from repeated taps. The server remains idempotent.

`PodcastPlayerStore` is route-scoped and owns canonical player state:

```text
episode
playbackStatus
positionMs
playbackRate
translationMode
progressSaveStatus
```

Computed state includes current turn, current word, progress percentage and next episode. Do not duplicate those values with effects.

`PodcastImportStore` additionally owns independent request states for transcript preview, topic-thumbnail upload and episode-thumbnail upload. Replacing an image must not invalidate a validated transcript preview; changing transcript content must invalidate the preview fingerprint. Upload mutations use `exhaustMap` or ordered mutation semantics so repeated taps cannot create competing media versions.

### 6.4 Theme reuse

- Reuse the Story Studio paper, pine, sage, sand, karaoke and typography tokens (`--lc-ss-*`).
- Reuse shared spacing and radius tokens (`--lc-space-*`, `--lc-radius-*`).
- Reuse the existing story cover/card rhythm rather than introducing a new visual system.
- Speaker colors must be a small stable, accessible token set and always be paired with speaker names or initials.
- Dark mode values belong in the central theme token definitions, not in individual components.
- Image overlays use centralized scrim/surface tokens and are verified against both bright and dark source scenes.

## 7. NestJS architecture

### 7.1 Module shape

```text
apps/api/src/podcasts/
├── podcasts.module.ts
├── controllers/
│   ├── podcast-library.controller.ts
│   └── admin-podcasts.controller.ts
├── services/
│   ├── podcast-library.service.ts
│   ├── podcast-readiness.service.ts
│   ├── podcast-progress.service.ts
│   ├── podcast-topic-command.service.ts
│   ├── podcast-import.service.ts
│   ├── podcast-thumbnail.service.ts
│   └── podcast-audio-generation.service.ts
├── infrastructure/
│   ├── elevenlabs-dialogue.adapter.ts
│   └── podcast-audio-storage.service.ts
├── repositories/
│   └── podcast.repository.ts
├── entities/
├── dto/
└── models/
```

Controllers handle authentication context, route/body binding and response status only. Application services coordinate use cases. `PodcastReadinessService` contains mastery calculations. The ElevenLabs adapter is the only layer aware of ElevenLabs request and response types.

`PodcastThumbnailService` validates decoded image metadata, creates responsive variants, coordinates `StorageService`, and returns application-level media metadata. Controllers never construct storage paths or process image bytes beyond the upload boundary.

### 7.2 Persistence model

`podcast_topics`

- `id`, `externalId`, `title`, `description`
- `targetLanguage`, `translationLanguage`
- `minimumLevel`, `maximumLevel`
- `thumbnailAssetId`
- `status`: draft, published, archived
- `createdAt`, `updatedAt`, `publishedAt`

Constraints:

- unique `externalId`;
- published topics must be returned only when at least one published episode exists.

`podcast_episodes`

- `id`, `topicId`, `externalId`, `position`
- `title`, `titleTranslation`, `description`, `level`
- `audioUrl`, `audioStoragePath`, `audioDurationMs`
- `thumbnailAssetId`
- `contentFingerprint`, `contentVersion`, `audioVersion`
- `status`: draft, validating, queued, generating, ready_for_review, published, failed, archived
- `generationErrorCode`, `publishedAt`, timestamps

Constraints:

- unique `externalId`;
- unique `(topicId, position)`;
- maximum duration enforced before publication;
- optimistic version or transactional ordering for concurrent reordering.

`podcast_thumbnail_assets`

- `id`, `storagePath`, `originalMimeType`, `originalWidth`, `originalHeight`
- `cardUrl`, `cardWidth`, `cardHeight`
- `heroUrl`, `heroWidth`, `heroHeight`
- `accessibilityDescription`
- `focalPointX`, `focalPointY`
- `contentHash`, `version`, `createdAt`

Constraints and lifecycle:

- Topic and episode rows reference assets by ID; API URLs are derived response data rather than authoritative identity.
- `contentHash` supports upload deduplication without making assets globally editable.
- Replacement creates a new immutable asset version and atomically changes the topic or episode reference.
- Old assets are deleted asynchronously only after no topic/episode version references them and the retention period has passed.
- A topic or episode cannot transition to published without a valid thumbnail asset.

`podcast_speakers`

- `id`, `episodeId`, `speakerKey`, `displayName`, `voiceId`, `position`
- unique `(episodeId, speakerKey)`.

`podcast_turns`

- `id`, `episodeId`, `speakerId`, `position`
- `targetText`, `translation`
- `startMs`, `endMs`, `wordTimings` JSONB
- unique `(episodeId, position)`.

`podcast_episode_vocabulary`

- `episodeId`, `lexemeId`, `position`, `importance`, `occurrences` JSONB
- unique `(episodeId, lexemeId)`.

If an expression cannot yet resolve to a canonical lexeme, the import remains `needs_attention`; do not create an untracked production vocabulary identity implicitly.

`user_podcast_progress`

- `userId`, `episodeId`, `positionMs`, `listenCount`
- `startedAt`, `lastListenedAt`, `completedAt`
- `playbackRate`, `translationMode`, `audioVersion`
- unique `(userId, episodeId)`.

### 7.3 Topic and episode transaction rules

- Adding an episode to an existing topic locks or atomically updates affected positions before inserting the new episode.
- Creating a topic with its first episode commits the topic, episode, speakers, turns and vocabulary mappings in one transaction.
- No database transaction remains open during ElevenLabs generation.
- No database transaction remains open during image decoding, resizing or object-storage upload.
- Upload the immutable thumbnail asset first, then atomically attach its ID to the draft entity.
- The accepted draft is committed first; generation is queued after commit.
- Repeated imports with the same external ID and fingerprint return the existing import result.
- A changed transcript creates a new content version and requires a new audio version.

## 8. API contracts

### Learner API

```text
GET    /podcast-topics?level=&query=&limit=&offset=
GET    /podcast-topics/:topicId
GET    /podcast-episodes/:episodeId
POST   /podcast-episodes/:episodeId/prepare-vocabulary
PUT    /podcast-episodes/:episodeId/progress
POST   /podcast-episodes/:episodeId/complete
```

Topic and episode response models include a normalized `thumbnail` object:

```text
assetId
cardUrl
heroUrl
width/height per variant
accessibilityDescription
focalPoint { x, y }
version
```

`GET /podcast-episodes/:episodeId` returns one UI-ready aggregate:

- episode and topic metadata;
- ordered speakers and turns;
- normalized word/turn timings;
- focus vocabulary with canonical IDs and current user mastery;
- readiness percentage and recommendation;
- user progress.

This avoids client-side joins and N+1 vocabulary requests.

Progress writes accept a client operation ID and use upsert semantics. Completion is idempotent.

### Admin API

```text
GET    /admin/podcast-topics
POST   /admin/podcast-topics
PATCH  /admin/podcast-topics/:topicId
POST   /admin/podcast-topics/:topicId/thumbnail
POST   /admin/podcast-episodes/:episodeId/thumbnail
POST   /admin/podcast-episodes/:episodeId/transcript/preview
POST   /admin/podcast-episodes/:episodeId/transcript
POST   /admin/podcast-episodes/:episodeId/generate-audio
PATCH  /admin/podcast-episodes/:episodeId/publish
PATCH  /admin/podcast-topics/:topicId/episodes/order
```

Thumbnail endpoints accept multipart file uploads plus accessibility description and focal point. They validate admin authorization, size, decoded type and dimensions before attaching the new immutable asset. Upload responses return the normalized thumbnail model used by the preview UI.

Preview is read-only. It returns a content fingerprint, normalized topic placement, estimated duration, vocabulary resolutions and conflicts. Import requires that fingerprint so the server rejects stale previews.

Audio generation uses ElevenLabs `POST /v1/text-to-dialogue/with-timestamps` with the
episode's ordered target-language turns and administrator-selected speaker voice IDs.
LinguaCard persists the returned MP3 through `StorageService` and converts provider
character alignment into its own turn and word timing records. Generation rejects
transcripts over the provider's 2,000-character reliability limit and generated audio
over five minutes.

## 9. Import payload

```json
{
  "schemaVersion": 1,
  "topic": {
    "mode": "existing",
    "topicId": "topic-id",
    "position": 5
  },
  "episode": {
    "externalId": "cafe-a2-05",
    "title": "Paying separately",
    "titleTranslation": "Getrennt bezahlen",
    "level": "A2"
  },
  "speakers": [
    { "key": "guest", "name": "Mia", "voiceId": "voice-id-1" },
    { "key": "server", "name": "Jonas", "voiceId": "voice-id-2" }
  ],
  "turns": [
    {
      "speakerKey": "guest",
      "targetText": "Können wir getrennt bezahlen?",
      "translation": "Can we pay separately?",
      "vocabularyRefs": ["getrennt-bezahlen"]
    }
  ],
  "vocabulary": [
    {
      "key": "getrennt-bezahlen",
      "text": "getrennt bezahlen",
      "translation": "to pay separately",
      "importance": "essential"
    }
  ]
}
```

For `topic.mode = "new"`, replace `topicId` with validated topic metadata. The server, not the client, assigns identifiers and authoritative publication state.

Binary thumbnail data is intentionally not embedded in this JSON. Topic and episode thumbnail assets are uploaded through their media endpoints and referenced by server-issued asset IDs during final import. The final import rejects missing, invalid or unattached required thumbnails.

## 10. Audio generation workflow

```text
validated draft committed
        ↓
generation job queued
        ↓
ElevenLabs dialogue request
        ↓
response validation and timing normalization
        ↓
audio uploaded through StorageService
        ↓
episode atomically updated to ready_for_review
        ↓
admin listens and publishes
```

Requirements:

- API keys remain server-side and use typed configuration validated at startup.
- Provider calls have explicit timeouts and map provider errors to stable application error codes.
- Jobs are idempotent by `(episodeId, contentVersion, audioVersion)`.
- Store request/trace IDs and character-cost metadata without storing secrets.
- Do not overwrite the currently published asset until the replacement generation and upload both succeed.
- Persist normalized LinguaCard timings; raw provider structures may be retained only as diagnostic metadata with a retention policy.

## 11. Offline and caching

- Metadata and transcripts may use the existing local/offline data conventions.
- Episode audio may be downloaded explicitly in a later phase; automatic downloads are out of MVP scope.
- Cached audio keys include `episodeId` and `audioVersion`.
- Thumbnail responses use immutable versioned URLs and long-lived caching. Entity responses change their referenced thumbnail version when an admin replaces an image.
- Card and hero variants prevent mobile lists from downloading full-resolution player imagery.
- The player must handle expired or missing audio URLs by refreshing episode media metadata once before surfacing an error.

## 12. Failure states

Learner:

- Catalogue unavailable: retain previously loaded data and show retry.
- Episode unavailable: distinguish removed/unpublished from temporary network failure.
- Audio fails: keep transcript readable and offer retry.
- Thumbnail fails: preserve layout with the neutral scene placeholder, keep title/status visible and offer retry where appropriate.
- Progress save fails: retain local position and retry on the next meaningful persistence event.

Admin:

- Schema conflicts block import.
- Missing or invalid topic/episode thumbnails block publication, not draft saving.
- A failed thumbnail replacement leaves the previously attached asset unchanged.
- Unresolved vocabulary blocks generation unless explicitly classified as an episode-only expression by a future supported workflow.
- Generation failure preserves draft content and actionable error category.
- Publication fails if audio, timings, translations, topic placement or duration constraints are incomplete.

## 13. Test strategy

### Domain tests

- Readiness weighting and threshold boundaries.
- Five-minute publication rule.
- Topic ordering insertion/reordering.
- Topic publish eligibility.
- Content/audio version transition rules.

### Angular store tests

- Search cancels stale reads.
- Route ID change resets episode/player state.
- Preparation submission cannot duplicate while in flight.
- Loading and error states always settle.
- Current turn/word derives correctly from normalized timings.
- Progress saving is throttled and flushes on pause/exit.

### Angular component tests

- Topic and episode rendering from inputs.
- Readiness actions emit intent and do not call services.
- Transcript exposes speaker and translation text accessibly.
- Translation modes and active-turn presentation.
- Correct card/hero thumbnail variants, focal-point styling, accessible descriptions and image-error fallback.
- Full-screen transcript contrast and usability over bright and dark scene images.

### Backend service tests

- Existing-topic and new-topic import paths.
- New topic plus first episode is atomic.
- Import fingerprint idempotency.
- Vocabulary reuse without mastery reset.
- Provider timeout/failure mapping.
- Generation retry does not duplicate assets or versions.
- Published asset survives failed regeneration.
- Thumbnail validation rejects spoofed MIME types, oversize files and insufficient dimensions.
- Thumbnail replacement is atomic and does not orphan the current asset on failure.
- Topic and episode publication rejects missing thumbnail assets.

### Integration/E2E tests

- Admin authorization on every mutation.
- Unique topic/episode ordering constraints.
- Import → generation → review → publish.
- Learner opens episode → prepares selected words → listens → resumes → completes.

## 14. MVP delivery slices

1. Topic/episode/thumbnail schema, admin topic management, secure image upload and validated manual import.
2. ElevenLabs adapter, background generation, storage and admin audio review.
3. Learner topic library, topic detail and episode readiness.
4. Karaoke player, progress persistence and completion.
5. Comprehension questions and post-listen review.

Each slice must include its migrations, API contracts, focused tests, translation keys, loading/error states, responsive image verification and dark-mode verification.

## 15. Acceptance criteria

- An admin can add an episode to an existing topic and choose its position.
- An admin can create a new topic and its first episode in the same flow without leaving an empty topic after cancellation or failure.
- An admin must provide distinct topic and episode thumbnails before publication and can preview their listing and player crops.
- Topic thumbnails appear everywhere a topic is listed; episode thumbnails appear everywhere an episode is listed and as the player scene.
- Replacing a thumbnail is atomic and does not break currently published content when processing or upload fails.
- Uploaded images are validated by actual content, dimensions and size, and clients receive responsive immutable variants.
- Full-screen target text and translation remain readable over every episode image and are rendered as UI rather than baked into the thumbnail.
- Audio generation never begins before validation and explicit approval.
- A published episode is no longer than five minutes.
- A learner sees vocabulary readiness based on existing canonical learning state.
- Preparing vocabulary does not duplicate lexemes or reset mastery.
- The learner can bypass preparation and listen immediately.
- The player synchronizes at turn level and upgrades to word level when timings exist.
- Manual translations remain available independently of ElevenLabs.
- Progress resumes reliably and does not write on every playback tick.
- All screens work in LinguaCard light and dark themes at mobile and wider Ionic layouts.
