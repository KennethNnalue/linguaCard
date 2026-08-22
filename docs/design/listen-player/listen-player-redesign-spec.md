# Listen and standalone player redesign

Status: design-approved candidate; implementation not started  
Scope: Listen setup page, Now Playing, bilingual audio sequencing, reusable list-player boundary  
Reference mockups: [list setup v2](./list-setup-redesign-v2.png) and [Now Playing v2](./now-playing-redesign-v2.png)

## 1. Product outcome

The Listen experience should let a learner choose any vocabulary list, understand exactly what will be spoken, and start a bilingual audio session with minimal setup. Every selected item must speak both the learning-language text and its native-language meaning. In the German-to-English case, the sequence is German then English.

The player must be a standalone application capability. Listen, a collection, due cards, struggling cards, search results, or a future list feature should all open the same player through a typed playlist contract. A caller supplies content and source metadata; it does not manage playback state or navigate through player internals.

## 2. Decisions

### Keep

- Source selection: due words, all words, struggling words, or a collection.
- Two content modes: `words` and `words-with-examples`.
- Play, pause, previous, next, shuffle, repeat, speed, progress, retry, and offline download.
- Queue preview and individual pronunciation preview.
- Resume/session persistence when the supplied playlist is still valid.

### Remove

- Deep Dive from types, settings, UI, script compilation, translations, completion badges, and tests.
- Grammar-tip playback and display.
- Duplicate mode and speed controls competing with the primary Play action.
- The large decorative setup hero when it pushes useful queue content below the fold.
- Silent native-language “reading beats.” Native segments are spoken.

### Simplify

- Rename “Playlist type” to “What to hear.”
- Present mode choices in user language:
  - **Words** — learning-language word + native-language meaning.
  - **Words + examples** — the above, followed by the example and its translation.
- Default to **Words + examples**, but remember the last valid choice.
- Keep speed at `1×` by default. Expose other speeds in a compact control or bottom sheet.
- Make shuffle a secondary action; Play remains the dominant action.

## 3. Audio behavior

### Required sequence

For each card in `words` mode:

1. target word, including article when present (`de-DE`)
2. short pause
3. native meaning (`en-US` for an English learning context)
4. pause before the next card

For each card in `words-with-examples` mode:

1. target word, including article
2. native meaning
3. target example, when available
4. native example translation, when available
5. pause before the next card

Missing optional example content is skipped without inserting an unexplained long silence. Empty required text creates a recoverable item error and offers Skip; it must never speak the wrong field.

### Language resolution

Do not hard-code `de` and `en` in the compiler or engine. Resolve BCP 47 voices from the playlist learning context, for example `de-DE` and `en-US`. The segment itself carries the resolved language and role.

Both target and native segments use the same audio-output abstraction. The existing engine currently converts every non-German segment into a timer; that is the direct cause of English being displayed but not spoken. Replace this branch with language-agnostic audio playback. Prefer cached HD audio when available. If product policy allows a platform-voice fallback, expose that choice through the audio service and announce degraded quality; otherwise surface a retry/skip state instead of silently advancing.

Speed applies to both languages. Pausing stops the active segment. Resuming restarts the current segment from its beginning unless true seek/resume is implemented. Next and Previous move by item, not by segment.

### Progress

- Item progress: one-based `currentIndex + 1` of total.
- Session progress: completed spoken segments divided by total playable segments, excluding silence.
- Remaining time: calculated from compiled segments and playback rate, not a fixed minutes-per-card constant.
- The UI highlights the segment currently being spoken and exposes its language label.

## 4. Screen specification

### Listen setup

Order from top to bottom:

1. Header: Back, `Listen`, overflow.
2. Source selector card: source name plus word count and estimated duration.
3. Session summary: count, `Target → Native`, primary Play, secondary Shuffle.
4. `What to hear`: two choices only, each stating that both languages are included.
5. Compact settings: Speed and Offline.
6. `Up next`: first three to five queue items with target, native meaning, correctly color-coded article, and preview-audio action.
7. Sticky bottom CTA: `Play {count} words` on compact screens.

The source selector replaces the ambiguous overflow-only discovery path. Empty sources show a specific empty state and a route back to available lists. Loading, offline, and download failures are visible without blocking unrelated controls.

### Now Playing

Order from top to bottom:

1. Collapsible header: close/back, source name, overflow.
2. Item progress and remaining duration.
3. Current item: article, target word, native meaning. The card surface inherits the article's subtle gender background treatment used by Review.
4. Spoken-sequence rail: target word, native meaning, target example, native translation. The active row has a visible speaking indicator. Rows absent from the compiled script are not rendered. Do not repeat explanatory `DE spoken` or `EN spoken` status labels above the rail.
5. Session scrub/progress.
6. Secondary controls: mode, speed, and queue drawer.
7. Thumb-zone transport: shuffle, previous, play/pause/retry, next, repeat.

Do not show mode cards or explanatory paragraphs while audio is playing. Changing mode recompiles only the current unplayed segment onward and must not jump to a different item. A queue drawer allows direct item selection and identifies completed/current/upcoming states.

Do not show an `Up next` item in the player. Vocabulary items advance within seconds, and the preview competes with examples that may require multiple lines. Example rows use content-driven height, wrap naturally, and never truncate or ellipsize their text.

### Responsive and accessibility requirements

- Support a 320 CSS-pixel-wide viewport without clipped controls.
- Minimum interactive target: 44 × 44 CSS pixels.
- Text respects dynamic type without overlapping transport controls.
- Gold is an accent, not the only state indicator; selected and active states also use shape, label, and icon changes.
- Maintain WCAG AA contrast for body text and controls.
- Every icon-only control has an accessible name and exposes pressed/disabled state.
- Playback state changes are announced politely; errors use assertive announcements.
- Respect reduced-motion settings; equalizers and pulses become static indicators.

## 5. Visual system

Promote the existing Vault/Review forest-and-brass language into Listen-specific semantic tokens rather than embedding new hex values in components:

| Token role | Intended use |
| --- | --- |
| `--lc-listen-bg` | near-black forest screen background |
| `--lc-listen-surface` | elevated pine cards and bottom controls |
| `--lc-listen-surface-active` | selected mode/current queue item |
| `--lc-listen-text` | warm ivory primary text |
| `--lc-listen-text-muted` | sage metadata |
| `--lc-listen-accent` | restrained brass eyebrow, small progress detail, or focus ring only |
| `--lc-listen-speaking` | mint audio activity only |
| `--lc-listen-border` | low-contrast surface separation |

Use the existing serif display family for vocabulary and headings, and the body sans-serif for controls. Avoid large gradients behind dense text. Primary CTA surfaces use warm ivory with forest text, matching Review. Brass must remain a secondary accent rather than a large fill or dominant outline.

Use the existing article-color system without substituting brass:

| Article | Gender | Dark-mode treatment |
| --- | --- | --- |
| `der` | masculine | `--lc-masc-bg`, `--lc-masc-text`, `--lc-masc-border` |
| `die` | feminine | `--lc-fem-bg`, `--lc-fem-text`, `--lc-fem-border` |
| `das` | neuter | `--lc-neut-bg`, `--lc-neut-text`, `--lc-neut-border` |

Queue badges use the shared `lc-article-badge`. The Now Playing word surface uses the corresponding subtle article background and border, as Review's answer surface does; the word itself remains warm ivory for contrast.

## 6. Standalone architecture

### Public entry contract

Introduce a player-facing port similar to:

```ts
export interface VocabularyPlayer {
  open(request: VocabularyPlaylistRequest): Promise<void>;
}

export interface VocabularyPlaylistRequest {
  playlistId: string;
  title: string;
  source: VocabularyPlaylistSource;
  languages: {
    target: Bcp47LanguageTag;
    native: Bcp47LanguageTag;
  };
  items: readonly VocabularyPlaylistItem[];
  initialMode?: VocabularyPlaybackMode;
}

export type VocabularyPlaybackMode = 'words' | 'words-with-examples';
```

`VocabularyPlaylistItem` is a player domain model, not a `Card` alias. It contains stable item ID, target word, optional article, native meaning, and an optional bilingual example pair. Each caller maps its own domain entities to this contract before calling `open`.

### Layer ownership

| Layer | Responsibility |
| --- | --- |
| Player route/container | route lifecycle, renders player state, forwards intent |
| `VocabularyPlayerStore` | owns session state and orchestrates load/start/pause/navigation/settings |
| Script compiler | pure conversion from playlist item + mode + languages to typed segments |
| Playback engine | cancellation-safe ordered segment sequencing and transport |
| Audio output port | play, stop, prefetch, cache/download, and language/voice resolution |
| Audio infrastructure | HTTP/cache/browser/native audio implementation |

The engine must not accept `Partial<ListenState>`. Give it a focused player host contract or, preferably, return typed playback events that the store reduces into state. UI components remain presentational and use signal inputs/outputs. Provide the player store at the player/session scope unless background playback is an explicit product requirement; if background survival is required, use an application-scoped playback service while keeping route UI state local.

### State model

Use discriminated session state so invalid combinations are not representable:

```ts
type VocabularyPlayerSession =
  | { status: 'idle' }
  | { status: 'preparing'; playlist: CompiledPlaylist; cursor: PlaybackCursor }
  | { status: 'playing'; playlist: CompiledPlaylist; cursor: PlaybackCursor }
  | { status: 'paused'; playlist: CompiledPlaylist; cursor: PlaybackCursor }
  | { status: 'error'; playlist: CompiledPlaylist; cursor: PlaybackCursor; error: PlayerError }
  | { status: 'complete'; playlist: CompiledPlaylist };
```

Store canonical playlist, cursor, status, settings, and error only. Derive progress, current item, active segment, remaining duration, and display rows with computed signals.

## 7. Migration plan

1. Add new player domain types and the caller-facing `VocabularyPlayer` port.
2. Replace `PlayMode` with the two valid modes and remove Deep Dive branches and translations.
3. Make segment language a BCP 47 tag and add an explicit segment role; remove the `lang === 'de'` engine decision.
4. Add language-agnostic `playSegment()` and `prefetch()` operations to the audio-output boundary.
5. Fix bilingual compilation and playback before visual work; cover it with deterministic engine/compiler tests.
6. Extract session state/orchestration into `VocabularyPlayerStore` and map existing Listen sources into the public request.
7. Change collection, due, struggling, and future list entry points to call `VocabularyPlayer.open()` directly.
8. Implement the setup and Now Playing presentational components against the new store.
9. Migrate saved settings: map `compact` to `words`, `examples` to `words-with-examples`, and `deepDive` to `words-with-examples`. Ignore incompatible saved sessions safely.
10. Remove obsolete Listen-only mode components and dead grammar-tip paths after all callers migrate.

## 8. Acceptance criteria

- Starting a German-to-English item audibly plays `die Birne`, then `pear`.
- Words + examples then audibly plays the German example and its English translation.
- Deep Dive and grammar tips are absent from setup, player, completion, saved settings, and domain types.
- A collection can open the player without first routing through and mutating the Listen setup page.
- Due, struggling, and arbitrary caller-supplied lists use the same player API.
- Switching mode preserves the current item and recompiles only unplayed content.
- Next/Previous during an in-flight segment cannot cause stale audio or a double advance.
- Both-language prefetch/download behavior matches the compiled script and reports partial failure.
- A missing audio asset produces a visible retry/skip state; it is never replaced by silence without feedback.
- Progress reaches 100% only after the last spoken segment completes.
- The two redesigned screens work at 320 px width, with dynamic text, screen reader labels, dark mode, and reduced motion.
- Long target and native examples wrap across multiple lines without clipping, overlap, ellipsis, or pushing transport off-screen.
- Now Playing has no redundant bilingual-status labels and no next-item preview.
- Article badges and the current-word surface use the shared gender color system; brass is never used as an article color.

## 9. Required tests

- Script compiler: both modes, both languages, article handling, missing examples, and empty text.
- Playback engine: ordered bilingual output, pause/resume, next/previous cancellation, retry, repeat, completion, and stale-generation protection.
- Store: open/reset for a new playlist, mode migration, source switching, error transitions, and session restoration identity checks.
- Audio boundary: language passed unchanged, cache/prefetch for both languages, partial download failure, and stop semantics.
- Components: rendered bilingual sequence, active speaking state, accessible control names/states, queue selection, and responsive overflow.
- Integration: collection → standalone player and due list → standalone player.

## 10. Out of scope for this pass

- Background/lock-screen media controls.
- Cross-device playback position sync.
- User-selectable voices.
- Grammar coaching or Deep Dive replacement.
- Story narration; it remains a separate long-form audio concern.
