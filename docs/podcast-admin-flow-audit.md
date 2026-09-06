# Podcast administration flow audit

## Intended ownership

```text
Podcast library
└── Topic
    ├── Topic settings and artwork
    └── Episodes
        └── Episode details, transcript, artwork, audio, review and publishing
```

Canonical admin routes now mirror that ownership:

- `/admin/podcasts` — topic library
- `/admin/podcasts/new` — create a topic
- `/admin/podcasts/:topicId` — edit, publish, or delete one topic and list its episodes
- `/admin/podcasts/:topicId/episodes/new` — create an episode for that exact topic
- `/admin/podcasts/:topicId/episodes/:episodeId/transcript` — generate, upload, or prepare a transcript for one draft episode
- `/admin/podcasts/:topicId/episodes/:episodeId/review` — edit, review, publish, or delete that exact episode

## Findings and resolutions

1. **Global episode creation selected the first topic.** The top-level New Episode tab fell back to `topics()[0]`, so the destination depended on list order. The global action was removed. Episode creation is now entered only from a loaded topic and carries its `topicId` in the route and create command.
2. **Global review selected an arbitrary episode.** Review fell back to the last episode across all topics, and the episode computed value fell back to the last episode in a topic. Review is now reachable from an episode row and resolves only the route's `topicId` plus `episodeId`. A mismatched pair renders no episode.
3. **New-episode imports could overwrite an existing episode.** Before a new episode existed, the old fallback made transcript import and copied prompts target the topic's last episode. The new-episode screen now has no selected episode until the current create/draft operation returns an ID.
4. **Topic editing was incomplete.** Topic metadata can now be saved, topic artwork can be uploaded or replaced, and a topic can be deleted with confirmation.
5. **Episode editing was cosmetic.** Generated detail inputs had no submit behavior or API endpoint. A validated episode update endpoint and store command now persist title, translation, and description.
6. **Deletion was absent.** Authenticated delete endpoints now remove topics or episodes. Topic deletion cascades its episodes; both operations also clean up database thumbnail records and best-effort delete thumbnail/audio objects from storage.
7. **The publish lifecycle was unreachable.** The backend requires artwork before audio generation, audio review before episode publishing, and at least one published episode plus topic artwork before topic publishing. The admin UI now exposes those uploads, audio playback/generation, episode publishing, and topic publishing with prerequisite-based disabled states.
8. **Transcript review had no behavior.** The button now loads the selected episode's persisted speakers and turns from an authenticated admin endpoint and displays the conversation.
9. **Tabs represented workflow steps as global entities.** The redundant Library/New Topic segment was removed. Topic creation is already available as the library's primary action, while episode creation and review remain child actions of their owning records.
10. **External transcript prompts incorrectly required vocabulary.** Copying the generation prompt now works before vocabulary is entered. The prompt still carries the topic, languages, level, and optional episode direction so an external generator can choose relevant vocabulary and return importable JSON.
10. **Persisted transcripts were not restored in the workflow.** Both transcript creation and review previously rendered only form state, even when the episode already had saved turns. These routes now load the selected episode's persisted transcript automatically. The transcript workspace shows its processed state and conversation, collapses generation/import controls when it is ready, and reloads the saved conversation after either generation or JSON import. Review also renders those same saved turns before confirmation.

## Lifecycle after the fixes

1. Create or open a topic from the library.
2. Edit topic metadata and upload topic artwork.
3. Create an episode from inside that topic.
4. Open the newly created episode or any existing episode from the topic's episode list.
5. Generate or import the transcript; reopening the draft restores the saved conversation and keeps replacement controls collapsed.
6. Continue to review, where the saved conversation is already visible, confirm it, and edit persisted episode metadata.
7. Upload episode artwork, generate audio, and listen to it.
8. Publish the episode when its status is `ready_for_review`.
9. Publish the topic after it has artwork and at least one published episode.

Topic and episode deletion require an explicit confirmation. Deleting a topic deletes all of its episodes.
