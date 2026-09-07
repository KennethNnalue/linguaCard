# Podcast Landscape Immersive Player — Implementation Specification

Status: proposed  
Change type: feature and responsive-player bug fix  
Primary client: Angular/Ionic mobile application  
Backend impact: none  
Design basis: the four supplied references, especially the two final landscape states

## 1. Outcome

Add an explicit expand action to the podcast player. Selecting it opens the current episode in an immersive landscape presentation without reloading the episode or restarting audio.

The landscape player has two presentation states:

1. **Resting state** — the complete episode artwork is visible against a black canvas and the current target-language line and translation remain readable. Player chrome is hidden.
2. **Controls-visible state** — a tap on the media surface adds a dark scrim and reveals the topic/title, play controls, timeline, settings, and a contract-to-portrait action. A later tap or the auto-hide timeout returns to the resting state.

This work also makes the existing player safe at every landscape viewport, including when a device rotates without a successful programmatic orientation lock.

## 2. Current-state findings

### 2.1 Existing player behavior

The route is `/podcasts/episodes/:episodeId/player`. `PodcastPlayerPage` is a route container and provides a route-scoped `PodcastPlayerStore`.

The page currently:

- renders the episode `heroUrl` as a full-viewport background;
- uses the stored focal point as `object-position`;
- renders the current turn and active word from store computed state;
- supports target-only and target-plus-translation modes from the UI;
- owns one native `<audio>` element and forwards time/play/pause/end events to the store;
- supports seek, ten-second skip, playback speed, episode repeat, topic queue continuation, and progress persistence;
- hides the application tab bar because the route is already classified as immersive.

The player store already contains all canonical playback state needed by landscape mode. Entering or leaving immersive mode must not create another audio element, reload the store, navigate to a second route, or duplicate playback state.

### 2.2 Root cause of the landscape defect

The layout is a portrait stack expressed with fixed vertical offsets:

- the dialogue is positioned `282px` above the bottom safe area;
- the controls occupy the bottom of the viewport;
- dialogue height is calculated from a fixed `410px` vertical reservation;
- the only compact rule is `@media (max-height: 650px)`, which still reserves a portrait-shaped control stack;
- the image always uses `object-fit: cover`.

At a typical phone landscape height, the header, dialogue, and controls compete for the same vertical space. The dialogue becomes clipped or hidden and its translation can no longer be read. `object-fit: cover` also crops a meaningful part of a 16:9 scene on wider or shorter displays.

### 2.3 Platform state

- The application uses Capacitor 8.
- iPhone and iPad declarations allow portrait and both landscape orientations.
- Android handles orientation configuration changes and does not currently lock the activity orientation.
- The PWA manifest currently declares `portrait`.
- `@capacitor/screen-orientation` is not installed.
- Capacitor 8 `SystemBars` is available from `@capacitor/core`; the legacy status-bar package is installed but is not currently used by the player.
- There is no shared orientation/fullscreen abstraction.

### 2.4 Existing test coverage

The player page test covers only playback-speed cycling. Store/domain tests cover playback ranges, current-turn timing, and playback queue behavior. There is no component-level coverage for the player DOM, responsive modes, orientation lifecycle, or control visibility.

## 3. Product decisions

### 3.1 Entry and exit

- Add an icon-only expand action in the currently empty right side of the portrait header.
- Its accessible label is **“Open landscape player”**.
- Activating it must preserve the current audio time, playing/paused state, speed, repeat mode, translation mode, current turn, and queue.
- In a native phone build, request landscape orientation and hide both system bars.
- In a supported browser/PWA, request element fullscreen from the button's user gesture, then request landscape orientation as a best effort.
- In unsupported browser contexts, keep playback working, apply the responsive landscape presentation when the viewport is landscape, and show a short non-blocking message: **“Rotate your device for landscape view.”**
- The controls-visible landscape header contains a contract action with accessible label **“Return to portrait player”**.
- Exiting requests portrait orientation, restores system bars/fullscreen state, and keeps playback uninterrupted.
- Leaving the route, destroying the page, completing the episode, or navigating back must restore portrait/system UI even if an earlier enter/exit operation failed.

### 3.2 Artwork

- Portrait mode retains the current edge-to-edge `object-fit: cover` treatment and stored focal point.
- Landscape immersive mode uses `object-fit: contain` on a black background so the entire `heroUrl` is visible.
- Letterboxing/pillarboxing is expected and preferred to cropping.
- Do not stretch the image, substitute the card asset, or bake transcript text into the artwork.
- A subtle static gradient behind the transcript is allowed in the resting state; the whole-scene dimming scrim is shown only with controls.

### 3.3 Transcript and translation

- The transcript is not part of “player chrome”; it remains visible in both landscape states.
- Place the transcript near the lower edge, above the home indicator/safe area and above the timeline when controls are visible.
- Preserve speaker name, target-language line, word-level karaoke highlight, and translation behavior from the store.
- The default `both` translation mode shows both lines in landscape. A user who explicitly selected target-only mode continues to see target only.
- In reveal mode, the reveal action remains interactive while chrome is hidden.
- Use a width-constrained dark backing/scrim for the translation line and text shadow or a translucent backing for the target line so both remain legible over bright images.
- Limit the visible target and translation blocks to two lines each in landscape. If editorial content exceeds the space, the block may scroll internally; it must never sit behind transport controls.

### 3.4 Controls visibility

Local presentation state, not the player store, owns control visibility.

State rules:

| Event | Result |
| --- | --- |
| Immersive entry succeeds | Resting state; chrome hidden |
| Tap/click media surface while hidden | Show chrome and start the auto-hide timer if audio is playing |
| Tap/click media surface while visible | Hide chrome unless focus is inside an interactive control |
| Use any control | Keep chrome visible and restart the timer |
| Audio pauses, ends, or errors | Keep chrome visible; cancel auto-hide |
| Audio starts/resumes | Keep current state; if chrome is visible, restart auto-hide |
| Three seconds without interaction while playing | Hide chrome |
| Focus enters a chrome control | Keep chrome visible |
| `Escape` in web fullscreen | Synchronize local state to standard mode after `fullscreenchange` |

Use a single managed timeout and clear it on reschedule, exit, route leave, and destroy. Do not use an RxJS subscription or signal `effect` to copy derived state.

### 3.5 Landscape controls-visible composition

The controls-visible state follows the final supplied reference while retaining LinguaCard's current control set:

- top left: contract-to-portrait action;
- top center/left-safe region: topic title as secondary text and episode title as primary text;
- center: rewind ten seconds, play/pause, and forward ten seconds;
- bottom: elapsed time, progress range, and remaining time;
- bottom-safe secondary row or compact group: speed, repeat, and translation mode;
- transcript: anchored above the bottom timeline and never removed by chrome auto-hide;
- background: a single edge-to-edge scrim while chrome is visible.

The existing back-to-topic action is not duplicated in the center transport. It remains available in the top chrome so users can still leave the player without first returning to portrait.

All icon-only actions use Ionicons and have translated accessible labels. The expand/contract actions should use `expand-outline` and `contract-outline` unless a platform review selects the semantically equivalent Ionic icons.

## 4. Responsive contract

### 4.1 Mode selection

Render using two independent facts:

- **immersive requested**: the user selected the expand action and the application is managing orientation/system UI;
- **landscape viewport**: `matchMedia('(orientation: landscape)')` or equivalent reports the actual layout orientation.

Use the landscape composition whenever the viewport is landscape, even if a native/browser orientation request fails. This is the regression fallback that prevents the current clipped layout.

Only hide system bars and browser chrome when immersive mode was explicitly requested.

### 4.2 Supported viewport classes

- Phone portrait: keep the existing visual hierarchy and add the expand action.
- Phone landscape, including short 667×375 CSS-pixel viewports: use the landscape composition and compact control spacing.
- Large phone landscape, including 844×390 and 932×430: show the complete artwork plus full transcript and controls.
- Tablet landscape and split-screen: use the same contain-based stage; do not assume orientation lock succeeds.
- Desktop browser: the expand action enters browser fullscreen where supported; otherwise the current viewport receives the responsive presentation without breaking playback.

Landscape layout must use `100dvh`, all four safe-area insets, and logical padding. It must remain usable in both landscape-left and landscape-right so a notch never covers the exit button, title, or timeline.

## 5. State and architecture

### 5.1 Keep canonical audio state in `PodcastPlayerStore`

No player-store fields are required for this feature. `episode`, `currentTimeMs`, `isPlaying`, `speed`, `repeatMode`, `translationMode`, and queue state remain canonical and route-scoped.

Do not persist immersive mode. A newly opened episode starts in the standard player even if the previous episode was expanded. Automatic navigation to the next episode within the same page instance may retain immersive mode because the listening session has not ended.

### 5.2 Add an infrastructure service

Create `apps/mobile/src/app/features/podcasts/services/podcast-immersive-mode.service.ts` as the only layer that talks to:

- `@capacitor/screen-orientation`;
- Capacitor 8 `SystemBars`;
- `document.fullscreenElement`, `requestFullscreen()`, `exitFullscreen()`, and `fullscreenchange`;
- `matchMedia('(orientation: landscape)')`.

The service owns external side effects and exposes a typed, UI-ready API such as:

```ts
type ImmersiveModeStatus =
  | { state: 'standard'; isLandscape: boolean }
  | { state: 'entering'; isLandscape: boolean }
  | { state: 'immersive'; isLandscape: boolean }
  | { state: 'exiting'; isLandscape: boolean }
  | { state: 'unavailable'; isLandscape: boolean; reason: 'fullscreen' | 'orientation' };

enter(host: HTMLElement): Promise<void>;
exit(): Promise<void>;
restorePortrait(): Promise<void>;
```

The exact public shape may follow established project testing conventions, but it must:

- prevent overlapping enter/exit operations;
- preserve a usable fallback when one platform call rejects;
- make exit idempotent;
- remove media-query and fullscreen listeners on destroy;
- restore every external setting it changed;
- avoid logging or displaying raw platform exceptions.

On native platforms, use `ScreenOrientation.lock({ orientation: 'landscape' })` for entry and `ScreenOrientation.lock({ orientation: 'portrait' })` for exit/cleanup. Use `SystemBars.hide()` and `SystemBars.show()` for both status and navigation bars. Do not use `StatusBar` alone because it does not hide Android's navigation bar.

On web, call `requestFullscreen()` before `screen.orientation.lock('landscape')`; both require user activation/support in common browser implementations. Treat orientation lock as optional after fullscreen succeeds. Listen for browser-initiated fullscreen exit and reconcile the page state.

### 5.3 Page-local presentation state

`PodcastPlayerPage` remains the container and owns only transient UI signals:

- whether landscape chrome is visible;
- whether an enter/exit action is pending;
- the non-blocking fallback message, if any.

Derive landscape classes from the immersive service state. The page forwards audio and control intent exactly as it does now.

Do not place browser APIs in the store and do not add orientation fields to shared domain models or API contracts.

### 5.4 Template structure

Keep one `<audio>` element and one set of playback controls. Do not render separate portrait and landscape audio/player trees with mutually exclusive `@if` blocks, because switching trees would recreate the media element and can interrupt playback.

Recommended single-tree structure:

```text
player host
├── contain/cover scene image
├── resting transcript scrim
├── controls-visible full-scene scrim
├── top chrome (back, title, expand/contract)
├── current-turn transcript
├── transport/timeline/secondary controls
├── progress/fallback status
└── one audio element
```

Apply mode and chrome-visibility classes/attributes to the host. Use CSS to reposition existing elements. Interactive descendants must stop the surface-tap gesture from hiding chrome before their own action runs.

If the combined template becomes difficult to read during implementation, extract a presentational `PodcastPlayerControlsComponent` with signal inputs and intent outputs. It must not inject the store, API service, or immersive service.

## 6. Platform configuration

1. Add `@capacitor/screen-orientation` at the Capacitor 8-compatible version and run Capacitor sync.
2. Keep the existing iPhone landscape declarations in `Info.plist`.
3. Do not add `UIRequiresFullScreen` merely to force iPad rotation; that disables iPad multitasking. iPad/split-screen must instead rely on the responsive fallback.
4. Do not opt out of Android 16 large-screen adaptive-layout behavior. Orientation lock may be ignored on large screens; the landscape CSS remains authoritative.
5. Keep the PWA manifest portrait declaration in this first implementation so the rest of the installed web app does not unexpectedly rotate. Browser fullscreen/orientation is best effort and the responsive fallback remains supported.
6. After dependency/configuration changes, regenerate native projects with the existing Capacitor build/sync workflow and inspect the native diff.

## 7. Accessibility and interaction requirements

- All visible controls remain reachable by keyboard and assistive technology when chrome is visible.
- Hidden chrome is removed from focus/navigation (`inert` or structural hiding), not merely made transparent.
- Do not auto-hide while focus is within chrome.
- Surface tap handling must not consume seek, reveal-translation, back, exit, or transport activation.
- The host communicates status changes such as unavailable fullscreen through a concise `role="status"` message; it does not repeatedly announce chrome visibility.
- Respect `prefers-reduced-motion`: replace fades/slides with immediate state changes.
- Maintain at least 44×44 CSS-pixel touch targets.
- Scrims and text surfaces must meet WCAG AA contrast over both very bright and very dark thumbnails.
- Decorative scrims are hidden from accessibility APIs. Preserve the episode image's current accessibility description.
- Localize all currently hard-coded player strings as part of this work, including loading/error messages and every `aria-label`, in all existing locale files.

## 8. Error and cleanup behavior

- Orientation failure must not pause, restart, or seek audio.
- Fullscreen failure must leave the standard player interactive.
- System-bar failure must not block landscape layout.
- If only part of entry succeeds, cleanup reverses the successful parts.
- Route exit cleanup runs from both Ionic page-leave handling and destruction and is safe when called more than once.
- When the application backgrounds during immersive playback, existing progress persistence requirements still apply. On resume, retain immersive mode only if the page is still active and the platform still reports landscape/fullscreen; otherwise reconcile to standard mode.
- If progress saving fails, the existing progress error remains visible above safe areas in both states.

## 9. Step-by-step implementation plan

### Step 1 — Add and sync platform capability

- Install the Capacitor 8 screen-orientation package.
- Sync iOS and Android.
- Verify the generated native dependency changes are limited to the plugin integration.
- Do not change API/domain contracts.

### Step 2 — Build the immersive infrastructure boundary

- Add `PodcastImmersiveModeService` with native and web paths.
- Add actual-orientation observation, fullscreen-exit observation, idempotent cleanup, and typed failure mapping.
- Use `SystemBars` for native system UI.
- Unit test success, partial failure, duplicate calls, browser-initiated exit, and listener cleanup.

### Step 3 — Add page-local interaction state

- Inject the immersive service into `PodcastPlayerPage`.
- Add enter, exit, surface-tap, interaction, focus, and auto-hide behavior.
- Wire cleanup into route leave and destroy without changing `stopAudioPlayback()` semantics beyond the existing route lifecycle.
- Preserve immersive mode across next-episode navigation only when the same page/listening session remains active.

### Step 4 — Update the single player template

- Replace the portrait header spacer with the expand action.
- Add the landscape contract action and controls-visible title treatment.
- Add host state classes/attributes and a surface gesture layer that does not cover interactive content.
- Keep transcript DOM mounted and keep one audio element.
- Add localized labels/status text and disabled/pending semantics during transitions.

### Step 5 — Implement responsive visual states

- Preserve current portrait styling.
- Add landscape contain-mode artwork with black letterboxing.
- Position the resting transcript and controls-visible transcript without fixed portrait offsets.
- Add top chrome, center transport, bottom timeline/settings, safe-area padding, scrim transitions, and reduced-motion rules.
- Ensure short landscape heights use compact sizing through `clamp()` and grid/flex layout instead of another set of fragile fixed offsets.

### Step 6 — Internationalize the player

- Add a `podcasts.player` translation namespace to every locale.
- Move hard-coded visible errors, loading copy, reveal copy, time/control labels, expand, contract, repeat, subtitle, and speed labels to translation keys.
- Verify long localized titles and right-to-left Arabic layout in both landscape orientations.

### Step 7 — Add behavioral and visual coverage

- Expand the page spec into Angular DOM tests.
- Add service unit tests with platform/DOM adapters mocked at their boundary.
- Add or run device-level smoke tests for iOS, Android, installed PWA, and browser fallback.
- Capture visual baselines for resting and controls-visible states at representative viewport sizes.

### Step 8 — Verify and release safely

- Run focused Jest tests, the complete mobile test target, TypeScript build, and mobile lint.
- Run the production mobile build and Capacitor sync.
- Test on at least one physical iPhone and one physical Android phone; simulators do not fully represent rotation locks, notches, home indicators, or system bars.
- Inspect the final diff for unrelated generated/native changes.
- Release behind no backend migration because this is a client-only enhancement.

## 10. Test matrix

### 10.1 Unit/component tests

- Expand action is present in standard portrait mode with the correct accessible name.
- Entering immersive mode does not replace the audio element or change current time/play state.
- Resting landscape hides focusable chrome but shows target text and configured translation.
- Surface tap reveals chrome; a second non-control tap hides it.
- Control activation does not also hide chrome.
- Playing state auto-hides after three seconds; paused/ended/error states do not.
- Timer is reset after control interaction and cleared on cleanup.
- Contract action restores portrait and standard player state.
- Route leave/destroy invokes idempotent restore even after partial entry failure.
- Fullscreenchange initiated by the browser reconciles local state.
- Manual landscape viewport uses the non-overlapping landscape CSS even without immersive success.
- Reveal translation remains operable while main chrome is hidden.
- Existing speed, repeat, subtitle, seek, completion, and queue behavior continues to work.

### 10.2 Device/browser matrix

| Surface | Required checks |
| --- | --- |
| iPhone portrait → landscape-left/right | lock, system bars, notch safe areas, audio continuity, return to portrait |
| Android phone portrait → landscape-left/right | lock, both system bars, back behavior, audio continuity |
| iPad full screen and split view | responsive fallback when orientation lock is unavailable |
| Android 16 large screen | adaptive landscape without relying on orientation lock |
| Installed PWA | fullscreen/orientation best effort, manifest portrait behavior, fallback message |
| Mobile Safari/Chrome browser | user-gesture fullscreen behavior and clean rejection fallback |
| Desktop Chrome/Safari/Firefox | element fullscreen where available, `Escape` reconciliation, keyboard focus |

## 11. Acceptance criteria

The feature is complete when all of the following are true:

1. A user can enter landscape immersive playback from the existing podcast player through an accessible expand button.
2. Audio continues at the same position and with the same settings through entry and exit.
3. The entire episode hero image is visible in immersive landscape without stretching or cropping.
4. In the resting state, target text and the configured translation remain visible and readable while other chrome is hidden.
5. A surface tap reveals title, back/contract actions, timeline, transport, speed, repeat, and translation controls.
6. Chrome auto-hides only while playing and never disappears while a control has focus.
7. No supported phone landscape viewport clips or overlaps the transcript and controls.
8. Manual rotation or an unavailable orientation lock still yields a usable landscape layout.
9. Leaving or completing the player reliably restores portrait orientation and system UI.
10. iPad/large-screen behavior remains adaptive without disabling multitasking or opting out of platform layout policy.
11. All player-facing copy and accessible labels are localized.
12. Existing playback, karaoke timing, translation modes, progress persistence, completion, repeat, and queue tests remain green.

## 12. Out of scope

- Backend or database changes.
- New thumbnail formats or regenerated podcast artwork.
- Changing transcript/timing data.
- Persisting a user's immersive-mode preference.
- Redesigning the preparation, library, topic, or completion screens.
- Adding video or picture-in-picture playback.
- Forcing iPad full-screen-only mode or opting out of Android large-screen adaptability.

## 13. Implementation references

- Capacitor 8 Screen Orientation: <https://capacitorjs.com/docs/apis/screen-orientation>
- Capacitor 8 System Bars: <https://capacitorjs.com/docs/apis/system-bars>
- Fullscreen API: <https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API>
- Screen Orientation lock compatibility: <https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock>

