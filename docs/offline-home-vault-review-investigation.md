# Home, Vault, Review, Stories, and Listen offline investigation

## Goal

Make the installed Capacitor Android application render previously synchronized content immediately, remain usable without connectivity, and reconcile local changes automatically after connectivity returns.

## Investigation plan

1. Trace the Android/Capacitor build and packaged web assets.
2. Trace Home, Vault, and Review routes to their stores, APIs, and local persistence.
3. Trace offline writes, review commits, active sessions, and the synchronization queue.
4. Trace reconnect, foreground, periodic, and pull-to-refresh synchronization.
5. Trace non-JSON resources, especially pronunciation audio.
6. Add regression tests around cold-start offline behavior and refresh failures.
7. Build the production web bundle and synchronize it into the Android project.
8. Trace Stories and Listen metadata, playback sessions, media downloads, and offline mutations.

## Findings

### Packaged application shell

- Production builds write the Angular application to `www`; `npx cap sync` copies that bundle into Android and iOS. A normal installed native build therefore does not need the network to load its HTML, JavaScript, compiled styles, JavaScript chunks, bundled icons, or translation JSON.
- A live-reload build with `CAPACITOR_DEV_SERVER_URL` is intentionally network-dependent and must not be used to assess release offline behavior.
- Angular's service worker covers the web/PWA deployment. It is not the primary offline mechanism for the native Capacitor shell.
- The audit found all primary UI typefaces loaded from Google Fonts at runtime. Those imports have been replaced by packaged Fontsource files; the production bundle now contains 68 local font files and contains no `fonts.googleapis.com` or `fonts.gstatic.com` reference.
- After a production build and Capacitor sync, Android and iOS contain the same 283 generated web files as `www`; each native copy adds only Capacitor's generated `cordova.js` and `cordova_plugins.js` bridge files.

### Home and Vault

- Legacy `CardStore` and `CollectionStore` were already cache-first and user-scoped.
- The displayed Home totals, Home hero, Vault list, collection summaries, and several Review summary screens use `VaultV2Store`.
- `VaultV2Store` was API-only. On a cold offline launch it exposed an empty/error state even when legacy cards and collections had been saved.
- The common synchronization pipeline refreshed legacy cards and collections but did not refresh `VaultV2Store`, allowing the visible V2 projection to remain stale after reconnect.
- The V2 store did not reset when the authenticated user changed, creating a risk that one user's in-memory snapshot could remain visible briefly to another user.

### Review

- Review execution uses cached `ScheduledCard` records from `CardStore`, so sessions can start offline after at least one successful card synchronization.
- The active session, history, scheduling projection, review commits, card administration commands, and completed sessions are persisted locally.
- Review writes use outboxes and the persistent Capacitor Preferences synchronization queue. Reconnect, app foreground, periodic sync, and manual refresh flush the queue.
- The Review hub and mastery summaries also depend on the V2 projection, so they inherited the cold-start display defect even though the review engine itself had offline data.

### Settings and engagement

- Engagement already has a local projection.
- Settings were API-only. A cold offline launch fell back to default study goals and could not reliably determine onboarding state. Settings changes queued for synchronization but the optimistic value was not durable across an app restart.

### Media and resources

- Pronunciation audio has a persistent native Filesystem cache and a web IndexedDB cache.
- Audio is prefetched for collection detail and import flows. Audio that has never been downloaded cannot play offline by design.
- There is no explicit “download this collection for offline use” contract or storage-budget UI. Automatically downloading an unbounded vault would be expensive and surprising.
- Collection, story, and podcast artwork now passes through a shared native image resolver. It renders the remote URL immediately online, persists it under a URL-derived key in the Capacitor Data directory, and resolves that same URL to a local Capacitor file after a restart. When offline and uncached it returns no image rather than making a doomed network request.
- Artwork caching is opportunistic when an image is rendered. Content that has synchronized but whose artwork was never displayed is not yet guaranteed to have its image downloaded.

### Stories

- User story lists and the Explore catalogue were already cached in Ionic Storage.
- Full platform stories were cached after opening, while user and platform narration used the native Filesystem audio cache.
- Story synchronization already refreshed metadata and prefetched uncached user-story narration on native Wi-Fi.
- Cold deep links into a user story did not first hydrate the cached story list, so they could fail offline.
- A cached story without generated/downloaded narration could not be opened offline even though its text was available.
- Story loading still attempted HTTP while known to be offline, and cache read failures could abort recovery.
- Story state was not reset when the authenticated account changed.
- Listen-count and learned-state mutations were not durable offline.
- Platform-story read markers, quiz scores, and saved words now use local progress plus an offline outbox. Platform keywords expose a stable word ID; existing JSONB records are backfilled by an idempotent database migration.
- Remote cover images are not explicitly downloaded into the native Filesystem cache.

### Listen

- Listen queues are built from the cache-first legacy CardStore and therefore contain offline-capable vocabulary metadata.
- Player settings and the current queue/card position survive restarts in WebView local storage.
- Target-language pronunciation uses the persistent native Filesystem cache. The existing “download queue” action downloads all server-backed spoken segments in the current queue.
- Native-language translations use platform text-to-speech. Offline playback depends on an appropriate offline voice being installed on the device.
- On a cold direct launch, Listen could construct an empty queue before CardStore finished hydrating cached cards and never reconstruct it.
- Sliding-window prefetch intentionally prepares only the next five cards; users must use the queue download action for guaranteed target-audio availability across the complete queue.

## Implemented steps

1. Added a user-scoped, complete V2 Vault snapshot containing its active context, Vault summary, and every paginated learning item.
2. Changed active Vault loading to hydrate the saved snapshot before network refresh.
3. Preserved cached content when refresh fails and supplied a specific first-use-offline error when no snapshot exists.
4. Added stale-load protection and account-change reset behavior.
5. Registered a V2 Vault refresher with reconnect/foreground/periodic synchronization.
6. Added V2 Vault and settings records to user-data deletion.
7. Made settings cache-first and persisted both server and optimistic settings.
8. Added regression coverage for cold offline Vault hydration and failed refresh with cached content.
9. Made cold user-story deep links hydrate the saved story list before falling back to HTTP.
10. Allowed cached story text to open offline when narration is unavailable, with audio reported as unavailable rather than treating the remote URL as playable.
11. Added account-change reset behavior and offline-aware story loading.
12. Persisted story listen counts and learned state locally and added synchronization queue handlers for both mutations.
13. Made Listen wait for CardStore hydration before constructing an empty default queue.
14. Added user-scoped platform-story progress caching and queued synchronization for read markers and completed quiz scores.
15. Extended the shared platform-keyword contract with a stable word ID, backfilled existing platform stories, and connected saved-word progress to offline synchronization.
16. Removed all runtime Google Fonts dependencies and bundled the exact app typefaces/weights into both native applications.
17. Rebuilt the production web bundle and synchronized identical copies into both Android and iOS native projects.
18. Added a shared native artwork cache and applied it to all user-facing Vault collection covers, user/platform Story covers, and Podcast library/topic/preparation/player/completion artwork.
19. Kept remote artwork URLs in cached domain records and synchronization payloads; device-local Capacitor URLs are resolved only at the image element boundary.
20. Added deterministic cache-key regression tests and verified the production Angular compiler with the new image directive.

## Native verification results (2026-09-03)

| Check | Android | iOS |
| --- | --- | --- |
| Production Angular build | Passed | Passed |
| Capacitor native asset sync | Passed | Passed |
| Embedded web files match `www` | Passed (283 files + 2 bridge files) | Passed (283 files + 2 bridge files) |
| Runtime Google Font dependency | Removed and verified absent | Removed and verified absent |
| Native project build | Blocked locally: installed JDK 25 is incompatible with the project's Gradle/Groovy (`Unsupported class file major version 69`) | Passed with Xcode 26.1 on iPhone 17 Pro simulator |
| Native shell launch | Not exercised: no connected Android device/emulator | Passed; login UI rendered from the embedded bundle |
| Authenticated force-stop + airplane-mode relaunch | Not yet exercised | Not yet exercised: no test account was pre-seeded and Simulator has no supported `simctl` airplane-mode switch |

These results prove the application shell, compiled CSS, chunks, local images, translations, and packaged fonts are present in both native projects. They do **not** prove that API-provided cover images or every user content record survives a real process death; those require the authenticated airplane-mode matrix below. The application also intentionally displays “You're offline — showing saved data” after three seconds, so being completely unaware of offline state is not the current product behavior.

## Recommended next improvements

1. Add an explicit collection-level offline download action that saves vocabulary plus all required pronunciation/example audio, reports progress and size, and supports removal.
2. Add a cache schema version and migration policy for V2 snapshots and settings.
3. Replace scattered `navigator.onLine` checks with the existing reactive Capacitor-backed network service so all platforms use one connectivity source.
4. Expose last successful sync time, pending operation count, and per-feature failure details in a diagnostics screen.
5. Add Android and iOS instrumentation coverage for: launch online, seed a deterministic account, force-stop, enable airplane mode, relaunch, compare screenshots/data, complete a review, restore connectivity, and verify server reconciliation.
6. Add conflict tests for offline create/update/delete operations and review commits made on two devices.
8. Cache story cover images explicitly and expose per-story download/remove controls.
9. Detect whether required native-language text-to-speech voices are installed and explain that requirement before marking a Listen queue fully offline-ready.
10. Add explicit background artwork prefetch after successful catalogue/Vault/Story synchronization so images are available even when their cards were never rendered online.
11. Pin a supported JDK (preferably 21) in local/CI Android tooling so the Android APK and instrumentation suite are reproducible.

## Manual Android verification

1. Run a production build and Capacitor sync.
2. Install the resulting Android app, sign in online, and visit Home, Vault, and Review once.
3. Force-stop the app, enable airplane mode, and relaunch it.
4. Confirm Home statistics, Vault words/collections, Review hub statistics, and review sessions are available.
5. Complete reviews and make a supported offline edit.
6. Disable airplane mode and foreground the app.
7. Confirm the pending count clears and the server reflects the local actions.
8. Open a user story and a platform story online, then repeat the force-stop/airplane-mode launch and confirm their text opens.
9. Confirm downloaded story narration and a downloaded Listen queue play in airplane mode.
10. Mark a user story learned and listen to it while offline, reconnect, and confirm both mutations reach the server.
