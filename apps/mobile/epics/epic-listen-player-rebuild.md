# Epic: Listen & Learn — Player Rebuild
**Epic ID:** LC-200  
**Status:** 📋 Planned  
**Priority:** High  
**Estimated stories:** 12  
**Affected features:** `features/listen/`, `shared/audio/`

---

## Executive Summary

The current Listen & Learn player is functionally broken and architecturally unsound. It exhibits race conditions, inconsistent playback behaviour, random card skipping, and deadlocking — all symptoms of a store that was never designed to manage the sequential, async state machine a TTS audio player requires. This epic tears it down and replaces it with a purpose-built, deterministic audio player engine that is testable, robust, and completely decoupled from the SRS rating system.

---

## Problem Statement

### Observed Bugs (from screenshots + user reports)

| # | Bug | Root Cause Hypothesis |
|---|-----|----------------------|
| B-01 | Card plays audio but example sentence / translation are sometimes skipped | `AudioService.speak()` promise is not awaited before state advances; race between TTS completion callback and Angular change detection cycle |
| B-02 | Player randomly skips a card without playing it | `currentIndex` is mutated in two places concurrently (shuffle reorder + auto-advance); the index lands on an already-visited position |
| B-03 | Player gets stuck and does not advance to next card | The "ended" event from the TTS engine fires before the Angular zone is entered, so the rxjs Subject never emits; `takeUntil` teardown eats the signal |
| B-04 | Playback mode (Word+Meaning / Examples / Deep Dive) does not reliably control what segments play | Segment sequencing is a series of `if/else` conditionals scattered across the component template and the store; no single source of truth for the active playback script |
| B-05 | Shuffle produces a different order mid-session | Shuffle mutates `queue` in-place and is also called on `ionViewWillEnter`; navigating back and returning re-shuffles |
| B-06 | Rating UI is embedded in the player, leaking SRS concerns into a listening-only context | `RatingComponent` and `sm2.service.ts` calls live inside the listen feature — wrong layer |
| B-07 | Speed control state is lost on navigation | Speed is component-local state, not store state |
| B-08 | `ListenStore` is a raw `@Injectable` with manual `signal()` fields | Violates the `signalStore()` mandate; no `withComputed`, no `withMethods`, no `withHooks`; impossible to test in isolation |

---

## Root Cause Analysis

### Current Architecture (broken)

```
ListenPage (component)
  │
  ├── ListenStore (@Injectable — raw signals, NOT signalStore)
  │     ├── signal: queue: Card[]          ← mutable, shared reference
  │     ├── signal: currentIndex: number   ← mutated from 3 different places
  │     ├── signal: isPlaying: boolean     ← not synchronised with TTS state
  │     ├── signal: playMode              ← 'word' | 'examples' | 'deepDive'
  │     └── NO segment sequencer — each mode branches inline
  │
  └── NowPlayingPage (component)
        ├── AudioService.speak()           ← fire-and-forget calls, no await chain
        ├── RatingComponent                ← SRS logic in wrong feature layer
        └── template conditionals for playMode branches
```

**Key architectural flaws:**

1. **No playback state machine.** The player has no concept of "segments within a card." Each card should play a deterministic sequence of audio segments (e.g. `[word_DE, pause, translation_EN, pause, example_DE, pause, example_EN]`), but this is nowhere modelled — it is approximated with scattered `setTimeout` calls.

2. **Async mismanagement.** `AudioService.speak()` returns a `Promise<void>`, but all call sites use `.then()` callbacks without error handling, and the "ended" callback often fires outside the Angular zone, causing silent failures.

3. **Mutable shared queue.** The `queue` signal holds the same array reference that the playlist screen renders. In-place shuffle and index mutations cause both views to flicker and desynchronise.

4. **SRS coupling.** The `RatingComponent` inside the player calls `sm2.service.ts` directly. A listener should not trigger spaced repetition — listening is passive, not evaluative.

5. **No recovery logic.** There is no timeout, no error state, no retry. If TTS fails silently (network hiccup, empty string), the player hangs forever.

---

## Solution Design

### Core Concept: The Playback Script

Every card is compiled into an immutable **`PlaybackScript`** — an ordered array of typed **`AudioSegment`** objects — before playback begins. The engine plays segments sequentially, advancing to the next card only after the last segment of the current card completes.

```typescript
// libs/shared/domain/src/index.ts — add to domain types

export type SegmentType =
  | 'word_target'       // German word (+ article for nouns)
  | 'word_native'       // English translation
  | 'example_target'    // German example sentence
  | 'example_native'    // English translation of example
  | 'grammar_tip'       // Short grammar note (Deep Dive only)
  | 'silence';          // Configurable pause between segments

export interface AudioSegment {
  type: SegmentType;
  text: string;
  lang: 'de' | 'en';    // drives TTS voice selection
  durationMs?: number;  // only for type === 'silence'
}

export interface PlaybackScript {
  cardId: string;
  segments: AudioSegment[];
}

export type PlayMode = 'compact' | 'examples' | 'deepDive';

export interface PlayerSettings {
  playMode: PlayMode;
  speed: 0.75 | 1 | 1.25 | 1.5;
  shuffle: boolean;
  repeat: boolean;
}
```

### Script Compiler (pure function, fully testable)

```typescript
// features/listen/services/script-compiler.service.ts

export function compileScript(card: Card, mode: PlayMode): PlaybackScript {
  const segments: AudioSegment[] = [];

  // All modes play the word
  segments.push({ type: 'word_target', text: card.front, lang: 'de' });
  segments.push({ type: 'silence', text: '', durationMs: 600 });
  segments.push({ type: 'word_native', text: card.back, lang: 'en' });

  if (mode === 'examples' || mode === 'deepDive') {
    if (card.exampleSentence) {
      segments.push({ type: 'silence', text: '', durationMs: 900 });
      segments.push({ type: 'example_target', text: card.exampleSentence, lang: 'de' });
      segments.push({ type: 'silence', text: '', durationMs: 500 });
      segments.push({ type: 'example_native', text: card.exampleTranslation ?? '', lang: 'en' });
    }
  }

  if (mode === 'deepDive' && card.grammarNote) {
    segments.push({ type: 'silence', text: '', durationMs: 700 });
    segments.push({ type: 'grammar_tip', text: card.grammarNote, lang: 'en' });
  }

  // Inter-card gap
  segments.push({ type: 'silence', text: '', durationMs: 1200 });

  return { cardId: card.id, segments };
}
```

### Player Engine (signalStore state machine)

The engine tracks a **two-level cursor**: `(cardIndex, segmentIndex)`. It never advances the card cursor until the segment cursor has exhausted all segments of the current script.

```
States: idle → loading → playing → paused → error → complete
                 ↓            ↓
            segment[0]    segment[n]
            segment[1]     → card[n+1]
            ...
```

```typescript
// features/listen/store/listen.store.ts  (REBUILT as signalStore)

interface ListenState {
  // Source
  sourceLabel: string;
  rawQueue: Card[];             // immutable after session start

  // Runtime queue (may be shuffled copy — never mutates rawQueue)
  queue: Card[];
  scripts: PlaybackScript[];   // compiled once; parallel array to queue

  // Cursor
  cardIndex: number;
  segmentIndex: number;

  // Status
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'complete';
  errorMessage: string | null;

  // Settings (persisted to localStorage via withHooks)
  settings: PlayerSettings;
}
```

### Async Engine: Segment Runner

The segment runner is a private rxjs pipeline living entirely inside `ListenStore.withMethods`. It uses `concatMap` to guarantee serial execution — no two segments ever play simultaneously.

```typescript
// Conceptual pipeline inside withMethods

private readonly segmentRunner$ = new Subject<AudioSegment>();

// Called once on store init
private initRunner(store, audioService: AudioService) {
  this.segmentRunner$.pipe(
    concatMap(segment => {
      if (segment.type === 'silence') {
        return timer(segment.durationMs ?? 600);
      }
      return from(audioService.speak(segment.text, segment.lang, store.settings.speed()));
    }),
    takeUntilDestroyed(),
  ).subscribe({
    next: () => store.advanceSegment(),
    error: (err) => store.handleSegmentError(err),
  });
}
```

`advanceSegment()` is a pure patchState call:
- If `segmentIndex < currentScript.segments.length - 1` → increment `segmentIndex`, emit next segment
- Else → increment `cardIndex`, reset `segmentIndex` to 0, emit first segment of next card's script
- If `cardIndex >= queue.length` → set `status: 'complete'`

**This eliminates all race conditions** — the runner processes exactly one segment at a time.

---

## Stories

### LC-200 · Spike: Audit current ListenStore and NowPlayingPage
**Points:** 2  
**Goal:** Document every bug, every wrong async pattern, every SRS coupling, every timer/setTimeout. Produce a written audit. No code changes.  
**Done when:** Audit document exists at `apps/mobile/listen-player-audit.md` with a line-by-line annotation of the current store and component.

---

### LC-201 · Domain: Add player types to shared domain
**Points:** 1  
**Goal:** Add `AudioSegment`, `PlaybackScript`, `PlayMode`, `PlayerSettings`, `SegmentType` to `libs/shared/domain/src/index.ts`.  
**Done when:** All types export from `@lingua-card/shared/domain`; no existing types broken; `nx build shared-domain` passes.

---

### LC-202 · Service: Build ScriptCompilerService (pure, tested)
**Points:** 2  
**Goal:** Create `features/listen/services/script-compiler.service.ts` with `compile(card, mode): PlaybackScript`.  
**Done when:**  
- Unit tests cover all three modes (`compact`, `examples`, `deepDive`) with a card that has/lacks `exampleSentence` and `grammarNote`  
- Returns deterministic output — same input always yields same output  
- Zero imports from Angular or Ionic (pure TypeScript)

---

### LC-203 · Store: Rebuild ListenStore as signalStore
**Points:** 5  
**Goal:** Replace the raw `@Injectable` `ListenStore` with a proper `signalStore()`.  
**Architecture:**  
- `withState(initialListenState)`  
- `withComputed` for `currentCard`, `currentScript`, `currentSegment`, `progress`, `isLastCard`  
- `withMethods` for `loadQueue`, `start`, `pause`, `resume`, `next`, `previous`, `seek`, `updateSettings`, `advanceSegment`, `handleSegmentError`  
- `withHooks` to persist `settings` to `localStorage` and restore on init  
- The serial `segmentRunner$` pipeline lives here  
**Done when:**  
- `ListenPage` and `NowPlayingPage` compile against the new store API  
- No `setTimeout`, no `.then()` chains, no fire-and-forget `speak()` calls anywhere in the feature  
- All SRS/rating code is deleted — zero imports of `sm2.service.ts` from listen feature

---

### LC-204 · Service: Harden AudioService for serial use
**Points:** 3  
**Goal:** Ensure `AudioService.speak()` always resolves (never hangs), always runs in the Angular zone, and supports cancellation.  
**Changes:**  
- Wrap native TTS callbacks in `NgZone.run()`  
- Add a timeout (8 s) after which the promise resolves with a warning rather than hanging  
- Add `cancel(): void` that immediately resolves any in-flight `speak()` promise  
- Return `Observable<void>` instead of `Promise<void>` (rxjs `from()` at call site already handles this)  
**Done when:** Unit test simulates a TTS engine that never fires "ended" — `speak()` resolves within 8.5 s.

---

### LC-205 · Feature: Remove all rating/SRS code from listen feature
**Points:** 1  
**Goal:** Delete `RatingComponent` usage, any `sm2.service.ts` import, and any `srsState` write from `features/listen/`.  
**Done when:** `grep -r "sm2\|Rating\|srsState\|masteryLevel" apps/mobile/src/app/features/listen` returns zero results.

---

### LC-206 · Page: Rebuild ListenPage (playlist screen)
**Points:** 3  
**Goal:** Rebuild the playlist/queue screen against the new store.  
**UI spec:** See `design-listen-player-v2.html` — "Listen Hub" screen.  
**Features:**  
- Source selector (today's due / collection / all cards) via `playlist-source-sheet`  
- Playlist type toggle: Compact / Examples / Deep Dive (writes to `store.settings`)  
- Queue list: shows card, article badge, category chip, due status  
- Play and Shuffle buttons that call `store.start()` / `store.start({ shuffle: true })`  
- Speed control that persists via store settings  
**Done when:** Navigating to the page shows a correctly populated queue; tapping Play navigates to NowPlayingPage and audio begins.

---

### LC-207 · Page: Rebuild NowPlayingPage (player screen)
**Points:** 5  
**Goal:** Rebuild the playback screen against the new store.  
**UI spec:** See `design-listen-player-v2.html` — "Now Playing" screen.  
**Features:**  
- Large card display: article badge, word (Lora display font), translation, example sentence + translation (mode-dependent visibility)  
- Animated segment indicator: subtle pulse on the currently playing segment  
- Progress bar: `cardIndex / queue.length` with time estimate  
- Transport controls: shuffle toggle, previous, play/pause, next, repeat  
- Speed selector: 0.75x / 1x / 1.25x / 1.5x  
- Mode selector: Compact / Examples / Deep Dive (can switch mid-session; recompiles scripts)  
- Error state: shows a recoverable "Tap to retry" pill when TTS fails  
- Complete state: navigates to session summary or loops if repeat is on  
- **No rating UI of any kind.**  
**Done when:** All three playback modes work reliably for a 20-card queue with no skips, no hangs, no double-plays.

---

### LC-208 · Component: PlaylistSourceSheet
**Points:** 2  
**Goal:** Bottom sheet for selecting the listen source.  
**Options:**  
- Today's due cards (from `CardStore` filtered by `nextDueAt <= now`)  
- Specific collection (from `CollectionStore`)  
- All cards  
- Struggling cards (mastery 0–2)  
**Done when:** Selecting a source closes the sheet and populates the store queue; the queue count updates on ListenPage.

---

### LC-209 · Session summary: Listen complete screen
**Points:** 2  
**Goal:** Simple summary shown when the queue completes.  
**Shows:**  
- Cards listened to count  
- Time elapsed  
- Mode used  
- "Listen again" (same queue, reshuffled) and "Back to home" CTAs  
- No ratings, no SRS updates.  
**Done when:** Completing a queue navigates here; both CTAs work.

---

### LC-210 · Settings persistence: restore player state on navigation
**Points:** 1  
**Goal:** If user navigates away mid-session (e.g. to Vault) and returns to Listen, the player resumes from the same card, same segment, same settings.  
**Implementation:** Store the `{ cardIndex, segmentIndex, settings, queueSnapshot }` in `localStorage` on every `patchState`; restore in `withHooks.onInit`.  
**Done when:** Backgrounding the app and returning does not restart from card 0.

---

### LC-211 · QA: End-to-end playback regression suite
**Points:** 2  
**Goal:** Playwright (or Cypress) e2e tests covering the three previously reported failure modes.  
**Test cases:**  
- T01: 5-card queue in Examples mode plays all cards and all segments without skipping  
- T02: Shuffle produces a stable order for the duration of the session  
- T03: Pausing mid-segment and resuming continues from the same segment  
- T04: Switching mode mid-session recompiles scripts and plays the new mode correctly for the next card  
- T05: Simulated TTS timeout shows error state and allows retry  
**Done when:** All 5 tests pass on CI.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  ListenPage (playlist)              NowPlayingPage (player) │
│  ─────────────────────              ──────────────────────  │
│  inject(ListenStore)                inject(ListenStore)     │
│  store.loadQueue(source)            store.currentCard()     │
│  store.start({ shuffle })           store.currentScript()   │
│  store.settings                     store.status()          │
│  store.queue                        store.pause()           │
│                                     store.resume()          │
│                                     store.next()            │
│                                     store.previous()        │
└────────────────────┬────────────────────────────────────────┘
                     │ inject
                     ▼
        ┌────────────────────────────┐
        │       ListenStore          │
        │  (signalStore — rebuilt)   │
        │  ─────────────────────     │
        │  State machine:            │
        │    idle→loading→playing    │
        │    →paused→error→complete  │
        │                            │
        │  segmentRunner$ pipeline:  │
        │    concatMap(segment)      │
        │    → audioService.speak()  │
        │    → timer(silenceDuration)│
        │    → advanceSegment()      │
        └──────────┬─────────────────┘
                   │ inject
         ┌─────────┴──────────┐
         ▼                    ▼
  AudioService          ScriptCompilerService
  (shared/audio)        (features/listen/services)
  ─────────────         ──────────────────────────
  speak(text,lang,      compile(card, mode)
    speed)              → PlaybackScript
  cancel()
  (NgZone-safe,
   timeout-guarded)
```

---

## What Is Explicitly Removed

| Removed | Reason |
|---------|--------|
| `RatingComponent` in listen feature | SRS is review-only; listening is passive |
| `sm2.service.ts` calls from listen feature | Wrong layer — SRS must not be triggered by passive listen |
| All `setTimeout` / `setInterval` calls in listen | Replaced by rxjs `timer()` inside `segmentRunner$` |
| Fire-and-forget `speak().then()` chains | Replaced by serial `concatMap` pipeline |
| In-place `queue` mutation for shuffle | Shuffle produces a new array; `rawQueue` is never touched |
| Bare `@Injectable` `ListenStore` | Replaced by `signalStore()` |

---

## File Map (after rebuild)

```
features/listen/
├── pages/
│   ├── listen/
│   │   ├── listen.page.ts          ← rebuilt (LC-206)
│   │   └── listen.page.scss
│   ├── now-playing/
│   │   ├── now-playing.page.ts     ← rebuilt (LC-207)
│   │   └── now-playing.page.scss
│   └── listen-complete/
│       ├── listen-complete.page.ts ← new (LC-209)
│       └── listen-complete.page.scss
├── components/
│   └── playlist-source-sheet/      ← rebuilt (LC-208)
├── services/
│   └── script-compiler.service.ts  ← new (LC-202)
└── store/
    └── listen.store.ts              ← rebuilt as signalStore (LC-203)

shared/audio/
└── audio.service.ts                 ← hardened (LC-204)

libs/shared/domain/src/index.ts      ← new types added (LC-201)
```

---

## Definition of Done (Epic Level)

- [ ] Zero `setTimeout` / `setInterval` calls in the listen feature
- [ ] Zero `sm2.service.ts` imports in `features/listen/`
- [ ] Zero `RatingComponent` usage in `features/listen/`
- [ ] `ListenStore` is a `signalStore()` — no raw `@Injectable` with manual `signal()` fields
- [ ] All three playback modes play every segment of every card without skipping or hanging across a 30-card test queue
- [ ] Shuffle produces a stable, non-repeating order for the full session
- [ ] Speed control persists across navigation
- [ ] Player state (card position) survives a background/foreground cycle
- [ ] All LC-211 e2e tests pass on CI
- [ ] `design-listen-player-v2.html` is the reference for all new screens
