# Podcasts in Listen and translated content titles

Status: implemented; legacy title translations remain empty until editors backfill them  
Change type: learner navigation and title-translation feature  
Reference: user-provided podcast browsing image is visual inspiration, not a source of product requirements

## 1. Product decisions

- Keep **Stories** as its own bottom tab. Its library, reading, narration, and generation flows stay there.
- Make the former **Listen** bottom tab a **Podcasts** destination. `/listen` opens podcast browsing directly, with the navigation tab labeled **Podcasts** and showing a microphone icon; there is no My words/Podcasts switch or card-selection control on that page.
- Keep vocabulary listening as an action from its source: collection details and other existing card/list entry points. The vocabulary player and its setup/queue may still have routes, but they are not a bottom-tab destination.
- Show each podcast and story title in the learning language with its title translation immediately beneath it in the learner UI. Admins can enter or correct both fields during creation and editing.

This replaces the earlier proposal to put Stories and My words under Listen. The screenshot's artwork-first sections are useful for podcast browsing; its music tabs, follow/subscription concepts, “Your shows,” “New episodes,” and global mini-player are not requirements for LinguaCard.

## 2. Current state and gaps

| Surface | Existing behavior | Required change |
| --- | --- | --- |
| Bottom tabs | Home, Vault, Stories, Listen | Keep four tabs and Stories placement; rename Listen to Podcasts. |
| Listen page | My words/Podcasts switch; source picker in shared header | Remove switch and source picker from Listen. Use podcast catalogue as landing content. |
| Vocabulary audio | Source sheet supports Due, All, Struggling, Collection; collection detail can open the player | Keep source selection within a vocabulary session launched from its source. |
| Podcast topic | Title exists, title translation does not | Add editable `titleTranslation` through persistence, admin, and learner contracts. |
| Podcast episode | `titleTranslation` exists in persistence/API and admin episode details editor | Surface it in learner screens; make it editable during episode creation and later editing. |
| Platform story | `titleTranslation` exists in persistence, catalogue/detail contracts, and import JSON | Render it in learner UI; add explicit admin creation and editing controls. |
| User story | `titleTranslation` exists in the story model | Render it in My Stories and reader; admin editing is out of scope for user-owned content. |

The podcast completion screen already renders the episode title translation. Keep that presentation consistent with other podcast screens.

## 3. Navigation and ownership

```text
Bottom tabs
Home | Vault | Stories | Podcasts
                           └── Podcasts catalogue

Collection detail / due words / other list source
  └── Listen to words -> vocabulary session setup or player
```

| Route | Role |
| --- | --- |
| `/listen` | Canonical podcast landing route, with Podcasts tab selected. |
| `/podcasts` | Compatibility redirect to `/listen`; preserve old links. |
| `/podcasts/topics/:topicId` | Existing topic and ordered episode view. |
| `/podcasts/episodes/:episodeId` and player/complete children | Existing preparation, playback, and completion. |
| `/stories` and reader routes | Existing Stories tab and story experiences. |
| `/listen/now-playing` and `/listen/complete` | Existing vocabulary playback routes; route prefix alone must not imply the Podcasts tab is selected. |

Keep collection/list source selection with the vocabulary session. A collection's **Listen** action passes its exact collection and title to the session/player. Other list entry points do the same for their source; no word-audio action lands on the podcast catalogue first. If due/all/struggling words need a setup screen, open it from those source actions with a visible source summary. Inventory actual callers during implementation rather than assuming every list already has an entry.

The Podcasts tab is selected on the catalogue, podcast topics, preparation, and non-immersive podcast pages. Existing immersive-player tab-bar behavior remains. A vocabulary session opened from Vault or another source must not misleadingly highlight Podcasts/Listen because its route starts with `/listen`; leaving playback returns to its source. This may require source-aware tab state or a clearer vocabulary route prefix.

## 4. Podcast catalogue layout

Use a compact, artwork-led page with episodes above topics, following the user's second reference image:

1. **Level chips**: A1–C1. Start from the learner's saved podcast level, otherwise their selected Explore level or onboarding level. Persist explicit podcast level selection.
2. **Episodes for you**: a dense, square-artwork grid of up to nine tiles containing the current in-progress episode first, then unplayed suggestions, then recently heard episodes to fill remaining slots. Each tile shows the episode title, translation, level, duration, topic, and truthful Continue/Listened state.
3. **Explore topics**: a compact 16:9 artwork rail below episodes, showing topic title, translation, level range, and episode count. **See all** expands to a grid.

Rank suggestions by closeness to the selected CEFR level. Within the same level distance, favor newer publication dates and variety across topics. Exclude episodes already in listening history from suggestions; recent activity appears separately in the combined top grid. When no exact-level episodes exist, show the nearest available levels instead of an empty grid. A level-specific offline cache prevents another level's suggestions from appearing after a filter change.

Remove the oversized decorative catalogue hero so the first useful episode appears close to the fold. Use the thumbnail focal point for crops. Put titles in live text, not inside images. Do not call topics “shows” or activity “new episodes”: the catalogue does not track follows or new/unseen publication state.

Topic detail lists episodes with title, translation, level, and duration. Episode preparation and player identify the same episode with title and translation. A completed episode remains replayable. The podcast learning flow and audio engine do not change.

## 5. Title and translation display contract

The learning-language title is primary; its translation is a secondary line immediately below. Apply this to:

- podcast catalogue topic cards and the combined featured-episode grid;
- podcast topic header and episode rows;
- podcast episode preparation, player identity, and completion;
- Stories Explore cards, continue card, My Stories rows, and platform/user story readers;
- story player title surfaces when they repeat the story title.

Use the content record's translation, not an application UI translation key or on-device machine translation. UI labels still use normal localization. Translation text wraps in compact cards and remains accessible at dynamic text sizes and 320 CSS pixels.

For legacy records with an empty translation, show the original title once and omit the secondary line. Never show a blank line, duplicate the title, or fabricate a translation. Admin surfaces flag such records for backfill. New publication or republication requires a nonblank translation in the content's declared translation language. Existing published content stays readable while editors backfill it.

Podcast topics carry `targetLanguage` and `translationLanguage`; topic and episode title translations use the latter. Platform stories carry `nativeLang`; their title translation uses that language. A future language-pair change must trigger translation review.

## 6. Admin creation and editing

### Podcast topics

Add **Topic title** and **Title translation** to New topic and Edit topic, with language labels visible. Add `titleTranslation` to the topic entity, migration, create/update DTOs, admin responses, and learner catalogue/detail responses. Validate trimmed nonblank text for new publication. Existing topics may need an empty migration value until backfilled. Show both titles in the admin list and editor.

### Podcast episodes

Keep the existing episode `titleTranslation` and details editor. Rename its generic “Translation” control to **Episode title translation** and show the parent topic's translation language. During creation, expose title and title translation before generating/importing transcript content, or provide a required metadata step immediately after draft creation and before publication. Generated/imported titles can prefill the fields, but admins can correct them. Creation must not make admins wait until the final episode details panel to edit the translation.

### Platform stories

Import JSON already carries `title` and `titleTranslation`, but the admin form exposes only raw JSON and the story list has no edit action. Add explicit **Story title** and **Title translation** controls to creation/import review, prefilled from parsed JSON. Reviewed values are authoritative on submit; do not retain a conflicting hidden copy in JSON. Show `nativeLang` beside them. Add **Edit story** from the admin list with both fields, a guarded update API, validation, and a read contract for prefilling. Title-only editing does not regenerate audio or alter sentences, progress, or adoption state.

The platform story editor is the admin scope. User-generated stories keep generation-derived translations and gain consistent display, but no admin edit interface in this feature.

## 7. Data propagation and migration

Podcast topic `titleTranslation` needs a database migration and explicit mapping through admin and learner responses. Episode and story translations already exist in their core models; do not duplicate columns. Provide an admin needs-translation filter or backfill report before enforcing publication requirements on legacy drafts.

Platform stories can be adopted into user-owned Story rows. Recommended title-update rule: correcting a platform title or translation updates adopted copies that still match the previous platform values, preserving any independently edited user title. If user title editing does not exist, updating all adopted copies is acceptable. Keep records consistent transactionally where practical and refresh relevant client caches. A title-only edit needs no audio regeneration.

Podcast and story catalogues may serve cached data. A network refresh replaces stale titles after an admin edit; offline caches show their last known value until then.

## 8. Implementation plan

1. **Prove the route/caller map.** Enumerate collection, due/all/struggling, and other vocabulary entry points. Confirm each can launch its source-specific session without visiting the podcast landing first.
2. **Change navigation.** Make `/listen` render the podcast catalogue, keep Stories in the bottom tab, remove the My words/Podcasts switch and source button, and preserve old podcast links and player back destinations.
3. **Add podcast topic translations.** Migrate persistence; update DTOs, admin forms/services, catalogue contracts, and learner cards/detail.
4. **Complete episode and story authoring.** Expose episode translations during creation, add explicit story import title fields and story edit API/UI, and define adopted-story propagation.
5. **Render translations.** Apply the primary-title/secondary-translation rule to podcast and story listings, detail, readers, and player identity with legacy-empty fallback.
6. **Verify behavior.** Run focused domain/API/component tests, route/deep-link and cache checks, plus responsive and accessibility review.

Keep Angular pages responsible for rendering, routing, and forwarding intent; use feature Signal Stores for state and async workflows. Keep API input validation in DTOs and publication/propagation rules in application/domain services. Reuse existing typed title fields and carry the new topic field explicitly through each boundary.

## 9. Acceptance criteria

- The bottom navigation has Stories and Podcasts. Selecting Podcasts shows the catalogue immediately, with no word-source button or My words switch.
- A user can listen to a collection or other supported word list from its own action, with the correct source. Exiting vocabulary playback returns to that source.
- The podcast catalogue leads with a level-aware episode grid combining Continue, suggestions, and recent listening, then shows the Explore topics rail; cards have artwork and bilingual titles.
- Every learner-facing podcast topic, podcast episode, platform story, and user story title surface renders its translation when present, with the original title primary.
- A blank legacy translation produces a clean single-title layout and appears in the admin backfill workflow.
- Admins can enter and edit translations for podcast topics, episodes, and platform stories. Story import exposes the title pair separately from raw JSON.
- New podcast topics/episodes and platform stories cannot be published without a valid title translation; old published records remain accessible while backfilled.
- Title-only edits do not trigger audio generation or reset listening, reading, or adoption progress.
- Old deep links work; selected tab and back navigation are correct for podcast, story, and vocabulary playback.
- Bilingual titles meet contrast, dynamic-type, screen-reader, and 320 CSS-pixel requirements in light and dark themes.

## 10. Prototype decisions

1. Rename the bottom label **Podcasts** now that its page is podcast-only. This removes the ambiguity between podcast browsing and collection listening.
2. Put episode title/translation fields in the initial New episode form or in a required metadata step after draft creation? Either works if they are visible before publication.
