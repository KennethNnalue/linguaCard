# Podcast essential vocabulary to platform collections

Status: implementation-ready specification  
Change type: feature  
Primary actors: administrator, learner  
Affected layers: shared contracts, NestJS application/persistence, Angular admin state/UI, platform collection discovery and adoption

## 1. User story

As an administrator, I want to publish the essential vocabulary from a published podcast episode as a platform collection so learners can discover and add it without creating duplicate dictionary content or paying again for enrichment and audio that already exist.

## 2. Investigation summary

### 2.1 Podcast vocabulary lifecycle

1. A podcast topic owns its target language, translation language, and CEFR level.
2. Transcript import resolves every vocabulary entry against the canonical `lexemes` and active `lexeme_localizations` tables.
3. Missing transcript vocabulary is created through `LegacyVocabularyProjectionService`; the episode then stores ordered links in `podcast_episode_vocabulary`.
4. Each episode vocabulary link already has the two fields needed by this feature: `lexemeId` and `importance` (`essential` or `supporting`).
5. Episode publishing currently requires a thumbnail, generated audio, and `ready_for_review` status. It does not publish a vocabulary collection.
6. Learners can already create a private preparation collection from the essential words of a published episode. That operation deduplicates ownership by `(userId, learningContextId, lexemeId)` and is separate from platform discovery.

### 2.2 Platform collection lifecycle

1. A platform collection is stored in `platform_collections`; ordered membership is stored in `platform_collection_words`.
2. Each membership currently requires a legacy `dictionaryWordId` for display/adoption and also carries the canonical `lexemeId` used for user-level deduplication.
3. Public discovery returns only `isPublished = true` collections matching the learner's active source/target language pair.
4. Adoption is idempotent by `(userId, sourcePlatformCollectionId)`. It skips vocabulary the learner already owns by canonical lexeme, then attaches both reused and newly created learning items to the adopted collection.
5. The collection import path avoids duplicate enrichment by resolving a shared lexeme/dictionary identity and reuses cached word audio. Publishing also refuses unresolved `lexemeId` links.

### 2.3 Integration gap

A podcast link contains a canonical `lexemeId`, but a platform collection membership still requires a `dictionaryWordId`. Podcast vocabulary newly created during transcript import can exist without a row in `word_dictionary` or `legacy_dictionary_lexemes`, because `LegacyVocabularyProjectionService` projects legacy dictionary content into the canonical model; it does not create the reverse legacy projection.

Therefore, copying podcast link rows directly into `platform_collection_words` is not safe. The new workflow must resolve or create the legacy dictionary projection from canonical vocabulary without invoking AI enrichment. Audio may be resolved through the existing global audio cache; only a genuinely missing clip may be generated.

## 3. Product decisions

### 3.1 Collection granularity

Create one platform collection per podcast episode, not one mutable collection per topic.

Rationale:

- essential vocabulary is defined on an episode;
- the learner preparation flow already uses episode-level ownership;
- episode-level collections have stable membership and metadata;
- publishing a later episode cannot silently change a collection already adopted by learners.

Default metadata:

- title: `Podcast · {episode.title}`;
- description: `Essential vocabulary for {episode.title}`;
- source language: topic translation language;
- target language: topic target language;
- level: episode level;
- topic: topic title;
- cover seed: episode external ID;
- cover image: episode card thumbnail URL;
- emoji: `🎙️`;
- external ID: `podcast-{episode.externalId}-essential`.

### 3.2 Preconditions

The action is available only when:

- the episode status is `published`;
- its owning topic status is `published`;
- at least one episode vocabulary link is marked `essential`;
- every selected lexeme has an active localization in the topic translation language;
- every selected lexeme can be resolved or projected to exactly one legacy dictionary row;
- the derived platform collection does not conflict with a collection owned by another source.

An episode may be published before its vocabulary collection. Podcast publication and collection publication remain separate administrator decisions.

### 3.3 Idempotency and provenance

Add nullable `sourcePodcastEpisodeId` to `platform_collections`, with:

- a foreign key to `podcast_episodes(id)` using `ON DELETE SET NULL`, so an already-published platform snapshot can survive removal of its source episode;
- a unique partial index where the value is not null;
- an index for lookup.

The publish command acquires a transaction-scoped advisory lock for the episode, then returns the existing derived collection when one already exists. Repeated clicks, HTTP retries, and concurrent requests must never create a second collection or duplicate membership rows.

Add a unique database index on `(platformCollectionId, dictionaryWordId)` in addition to the existing canonical lexeme uniqueness. This protects both sides of the transitional dual-reference model.

### 3.4 Snapshot behavior

The first successful publish creates a snapshot of the episode's current essential vocabulary. Repeating the command returns that collection unchanged. It does not silently add or remove words after learners may have adopted it.

Changing a published snapshot is out of scope for this story. A future explicit “create new version” workflow can replace it. The existing collection unpublish action remains available for removing discovery visibility without affecting learner copies.

### 3.5 Cost and deduplication rules

For each essential `lexemeId`, resolve content in this order:

1. Reuse an existing `legacy_dictionary_lexemes` mapping and its `word_dictionary` row.
2. If no mapping exists, load the canonical lexeme and active localization and create a dictionary row using their reviewed fields. Do not call `WordEnrichService`.
3. Upsert the legacy mapping to the original podcast `lexemeId`; verify that reverse projection did not resolve to a different canonical identity.
4. Resolve pronunciation through `WordAudioService`, whose global identity/cache must be checked before provider generation.
5. Never generate audio or enrichment for a dictionary row that already has the required asset/content.

Dictionary creation and mapping must be concurrency-safe through the existing unique dictionary key plus an explicit unique mapping invariant. A uniqueness race must reload the winner instead of surfacing a 500 response.

## 4. Proposed API and contracts

### 4.1 Endpoint

`POST /admin/podcast-episodes/:episodeId/platform-collection`

Authentication: existing `JwtAuthGuard` and `AdminGuard`.

No request body is required for the first version because metadata is derived deterministically.

Success response (`200 OK` for both first creation and replay):

```ts
interface AdminPublishPodcastVocabularyResult {
  collection: AdminPlatformCollectionListItem;
  created: boolean;
  essentialCount: number;
  dictionaryReused: number;
  dictionaryCreated: number;
  audioReused: number;
  audioGenerated: number;
}
```

Failure semantics:

- `404`: episode or topic does not exist;
- `409`: episode/topic is not published, no essential vocabulary exists, content is incomplete/ambiguous, or the derived external ID belongs to a non-podcast collection;
- unexpected persistence/provider failures use the existing global exception contract and must not leave a partial collection.

### 4.2 Admin read model

Extend `AdminPodcastEpisodeListItem` with:

```ts
essentialVocabularyCount: number;
platformCollection: {
  id: string;
  isPublished: boolean;
} | null;
```

Populate these fields in the admin topic listing so the UI can render the correct action without an extra request per episode.

## 5. Backend design

### 5.1 New application service

Create `PodcastPlatformCollectionService` under the podcast application/service boundary. It coordinates the use case; the controller remains a transport adapter.

Dependencies:

- `DataSource` for the business transaction and lock;
- podcast episode/topic/vocabulary repositories;
- platform collection and membership repositories/entities;
- canonical lexeme and localization repositories;
- legacy dictionary mapping and dictionary repositories;
- a new canonical-to-legacy dictionary projection service;
- word audio service/cache boundary.

Do not place this workflow in `AdminPodcastsService` or duplicate `AdminService.setPublished`. The operation crosses podcast, vocabulary, and platform collection boundaries and deserves an intent-named service.

### 5.2 Canonical-to-legacy projection

Add a focused `CanonicalDictionaryProjectionService` in the vocabulary/word-dictionary infrastructure boundary. Its method accepts a canonical lexeme, active localization, source language, and target locale, and returns:

```ts
interface CanonicalDictionaryProjectionResult {
  dictionaryWordId: string;
  reused: boolean;
  audio: 'reused' | 'generated';
}
```

It must:

- derive the same dictionary key used by `WordDictionaryService`;
- reuse an existing row for the language pair;
- create missing rows from canonical content only;
- preserve canonical article, gender, plural, phonetic, CEFR, translation, examples, and synonyms where present;
- resolve audio through the global audio service;
- upsert `legacy_dictionary_lexemes` with the requested canonical lexeme ID;
- fail with a domain conflict if the existing dictionary row is mapped to a different lexeme.

This avoids calling `persistEnriched` as an opaque shortcut: that method also projects dictionary data back into canonical vocabulary and does not guarantee that the returned mapping remains the podcast's exact lexeme under every identity shape.

### 5.3 Transaction sequence

Implement the publish operation in this order:

1. Preflight-read the episode and topic; require both statuses to be `published`.
2. Return the existing collection if `sourcePodcastEpisodeId = episodeId`.
3. Load essential vocabulary links ordered by position.
4. Require at least one link and reject duplicate canonical lexemes defensively.
5. Bulk-load canonical lexemes, active localizations, examples, and any legacy mappings.
6. Resolve missing dictionary projections and audio outside the final collection transaction. These resources are globally reusable, so a later failure does not create invalid content or waste the retry.
7. Start the final database transaction and acquire `pg_advisory_xact_lock(hashtext('podcast-platform-collection:' || episodeId))`.
8. Lock and re-read the episode and topic, rechecking both publication states.
9. Recheck `sourcePodcastEpisodeId`; return the winning collection if another request committed first.
10. Revalidate that the ordered essential link IDs still match the preflight snapshot. If they changed, abort with `409` and require a retry.
11. Insert the platform collection with `isPublished = true`, `status = published`, and `publishedAt = now()`.
12. Insert ordered `platform_collection_words` using the episode positions, resolved dictionary IDs, and original lexeme IDs.
13. Set `wordCount` to the inserted membership count.
14. Commit and return the collection plus reuse/cost counters.

If the audio provider fails for a genuinely missing clip, no platform collection is published. Already-created reusable dictionary content may remain because it is globally valid and idempotent; the retry must reuse it.

### 5.4 Query efficiency

Use bulk reads for links, lexemes, localizations, mappings, and dictionary rows. Do not perform one lookup query per vocabulary item. Audio resolution may use the existing bounded batch method or a new pre-enriched batch method that never invokes AI enrichment.

### 5.5 Module wiring

- Export the narrow projection provider from `WordDictionaryModule` or `VocabularyModule`.
- Import the platform collection entities and required dictionary entities/providers into `PodcastsModule`.
- Avoid a `PodcastsModule` ↔ `AdminModule` circular dependency; share entities/providers through their owning modules rather than importing `AdminService`.

## 6. Admin frontend design

### 6.1 API and store

Add `publishVocabularyCollection(episodeId)` to `AdminPodcastApiService`.

Extend `AdminPodcastStore` with an intent-oriented `publishEpisodeVocabulary` mutation using `exhaustMap` so duplicate taps are ignored while the request is active. On success:

- update the episode's `platformCollection` state;
- leave podcast publication state unchanged;
- show `Published {count} essential words; {reused} dictionary entries reused and {created} created.`;
- map `409` responses through the existing admin podcast error boundary.

No separate global collection store should be injected into the podcast page.

### 6.2 Episode review UI

For a published episode, add a “Vocabulary collection” section below the episode publish controls:

- show the essential word count;
- when no collection exists, show `Publish essential vocabulary`;
- disable it when the topic is not published, the count is zero, or a mutation is running;
- explain the unmet prerequisite inline;
- after success, show `Published to platform collections` and an `Open collection` action linking to existing admin collection management;
- do not show the action for draft/ready-for-review episodes.

Use existing Ionic buttons, icons, status feedback, and the current `AdminPodcastStore` container boundary.

## 7. Database migration

Create one forward migration that:

1. adds nullable `sourcePodcastEpisodeId` to `platform_collections`;
2. adds the podcast episode foreign key with `ON DELETE SET NULL`;
3. adds a unique partial index for `sourcePodcastEpisodeId IS NOT NULL`;
4. adds a unique index on `(platformCollectionId, dictionaryWordId)`;
5. adds or verifies a uniqueness rule that prevents one dictionary row from mapping to conflicting canonical lexemes.

Do not backfill collections heuristically by title. Existing platform collections remain source-neutral.

## 8. Tests

### 8.1 Domain/application service tests

- rejects an unpublished episode;
- rejects an episode whose topic is unpublished;
- rejects an episode with no essential words;
- excludes supporting vocabulary;
- preserves podcast vocabulary order;
- reuses mapped dictionary rows without enrichment or audio generation;
- creates a missing legacy projection from canonical content without AI enrichment;
- reuses cached audio and reports its counter;
- fails before publication when a localization is missing;
- fails on a conflicting dictionary-to-lexeme mapping;
- returns the same collection with `created = false` on replay;
- concurrent calls result in one collection and one membership per lexeme;
- a provider failure leaves no published partial collection and retry succeeds idempotently.

### 8.2 Controller/authorization tests

- admin receives the result contract;
- unauthenticated and non-admin callers are rejected by the existing guards;
- domain conflicts map to `409`.

### 8.3 Platform collection regression tests

- the generated collection appears only for matching source/target learning contexts;
- detail returns all essential words with dictionary content;
- adoption adds new lexemes, reuses owned lexemes, and creates no duplicate learning item;
- repeated adoption returns the existing user collection;
- unpublishing hides discovery but does not modify an adopted learner collection.

### 8.4 Angular tests

- the action appears only for a published episode;
- unmet topic/count prerequisites disable the action with useful copy;
- repeated taps produce one request;
- success updates local episode state and displays reuse counts;
- failure clears loading state and displays the mapped API error.

## 9. Step-by-step implementation plan

1. Add the shared result contract and admin episode collection summary fields.
2. Add the migration and update `PlatformCollectionEntity`.
3. Implement and unit-test `CanonicalDictionaryProjectionService`, including uniqueness-race and mapping-conflict behavior.
4. Implement and unit-test `PodcastPlatformCollectionService` with published-state checks, essential-only selection, bulk resolution, locking, idempotency, and transactional membership creation.
5. Register the service and required entities/providers in `PodcastsModule` without introducing a module cycle.
6. Add the guarded controller endpoint and controller tests.
7. Extend `AdminPodcastsService.listTopics` to bulk-load essential counts and derived collection summaries.
8. Add the Angular API method and Signal Store mutation with deterministic success/error state.
9. Add the episode review UI section and route to the existing admin collection screen.
10. Add integration tests covering discovery and adoption of the generated collection.
11. Run focused Jest suites, API and mobile TypeScript checks, lint, and migration up/down verification.
12. Manually verify: publish episode → publish topic → publish essential vocabulary → discover as a matching learner → adopt → confirm existing lexemes are reused and only one collection exists after retry.

## 10. Acceptance criteria

- An admin can publish a platform collection from the essential vocabulary of a published episode.
- Supporting vocabulary is never included.
- One episode can produce at most one platform collection.
- Retrying the command is safe and returns the same collection.
- Existing canonical lexemes, dictionary content, and audio are reused.
- No AI enrichment call is made by this workflow.
- Provider TTS is called only for a missing globally cached pronunciation required by the collection.
- Learners with the matching language context can discover and adopt the collection through the existing platform collection flow.
- Adoption does not create duplicate learner vocabulary and includes already-owned lexemes as collection memberships.
- Failures never expose a partially published collection.

## 11. Out of scope

- automatically publishing vocabulary when an episode is published;
- combining vocabulary across all episodes in a topic;
- editing or synchronizing a derived collection after its first publication;
- replacing the platform collection read model with canonical-only storage;
- adding supporting vocabulary to the published collection;
- changing the learner's existing private podcast preparation flow.
