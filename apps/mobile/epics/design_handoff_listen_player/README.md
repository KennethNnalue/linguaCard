# Handoff: Listen & Learn — Player Rebuild (LC-200)

## Overview

This is a complete redesign of the LinguaCard **Listen & Learn** audio feature. The current implementation (Angular + Ionic) has poor UX — the mode selector is unclear, the segment track is hard to read, controls are cramped, and the screen lacks its own visual identity. This redesign solves all of those problems with a dark immersive player, a teleprompter-style segment display, and a cleaner hub screen.

## About the Design Files

The file `Listen Player.dc.html` in this package is a **high-fidelity HTML design reference** — a fully interactive prototype showing intended look, feel, and behaviour. It is **not production code to copy directly**. Your task is to **recreate these designs inside the existing Angular / Ionic codebase**, using its established patterns: NgRx Signal Store, Ionic components, SCSS with `_tokens.scss`, `@ngx-translate`, and Angular standalone components. Do not ship the HTML prototype. Do not rewrite the store or the routing — only replace the templates and SCSS files listed below.

## Fidelity

**High-fidelity.** Pixel-accurate colours, typography, spacing, border radii, shadows, and interactions. Recreate every screen exactly as shown in the HTML prototype.

---

## Screens & Files to Change

| Screen | Route | Files to modify |
|---|---|---|
| Listen Hub | `/listen` | `listen.component.html`, `listen.component.scss` |
| Now Playing | `/listen/now-playing` | `now-playing.page.html`, `now-playing.page.scss` |
| Session Complete | `/listen/complete` | `listen-complete.page.html`, `listen-complete.page.scss` |
| Source Sheet | modal | `playlist-source-sheet.component.html`, `playlist-source-sheet.component.scss` |

**No TypeScript logic changes are needed.** All store methods, signals, routing, and audio pipeline stay exactly as they are. This handoff is template + SCSS only.

---

## Screen 1 — Listen Hub (`listen.component.html`)

### Layout

Full-screen scroll view (`ion-content`). Background: `$lc-ss-paper` (`#F4F1E9`). Font body: `$lc-font-body` (DM Sans). Font display: `$lc-font-display` (Lora).

```
ion-header (no border)
  toolbar → nav bar
ion-content
  source pill row
  hero dark card
  "Playlist Type" section label
  3-column mode card grid
  speed chip row
  queue header row
  queue list (scrollable)
  bottom spacer 32px
```

### Nav Bar

- Height: 54px. Flex row, space-between, align-center. Padding: 10px 18px.
- Left: empty spacer (38px).
- Centre: `"Listen & Learn"` — Lora, 19px, semibold, `$lc-text-primary` (`#1A2B26`).
- Right: ⋮ icon button — 38×38px circle, `background: rgba(45,90,78,0.08)`, no border. SVG: 3 vertical dots, fill `#1A2B26`.

### Source Pill Row

Flex row, space-between, align-center. Padding: 2px 18px 10px.

**Source pill button** (calls `openSourceSheet()`):
- Inline-flex, align-center, gap 7px.
- Background: `white`. Border: `1px solid rgba(45,90,78,0.18)`. Border-radius: 22px. Padding: 8px 14px.
- Box-shadow: `0 1px 4px rgba(45,90,78,0.07)`.
- Left icon: clock SVG, 13×13px, stroke `#2D5A4E`.
- Label: `listenStore.sourceLabel()` — DM Sans, 12px, semibold, `#2D5A4E`.
- Right chevron: 10×10px, stroke `#4A8C7A`, stroke-width 2.5.

**Right label**: `~{{ listenStore.estimatedMinutes() }} min` — 11px, `$lc-text-hint` (`#9BAAA6`), weight 500.

### Hero Dark Card

Margin: 4px 16px 16px. Background: `linear-gradient(145deg, #1A3830 0%, #0D1E16 100%)`. Border-radius: 22px. Padding: 22px 20px 20px. Overflow: hidden. Position: relative.

Decorative circles (position absolute, pointer-events none):
- Top-right: width/height 120px, `border-radius: 50%`, `background: rgba(110,231,183,0.04)`, top: -28px, right: -28px.
- Bottom-right: width/height 90px, `border-radius: 50%`, `background: rgba(255,255,255,0.03)`, bottom: -40px, right: 10px.

**Audio bars row** (purely decorative, not animated on hub screen):
- 5 bars: `width: 3px`, heights [10, 16, 8, 14, 6]px, `background: rgba(110,231,183,0.65)`, `border-radius: 2px`.
- After bars: source label text — 10px, weight 700, letter-spacing 0.08em, uppercase, `rgba(255,255,255,0.35)`, margin-left 7px.

**Word count headline**: `{{ listenStore.queue().length }} words` — Lora, 28px, semibold, white, line-height 1.2, margin-bottom 4px.

**Sub-line**: `~{{ listenStore.estimatedMinutes() }} min · {{ playMode }} mode` — 12px, `rgba(255,255,255,0.45)`, margin-bottom 20px.

**Button row** (gap 10px):

Play button (calls `play()`, disabled when no queue):
- Background: `white`. Color: `#0D1E16`. Border: none. Padding: 11px 22px. Border-radius: 24px. Font: 13px, weight 700.
- Box-shadow: `0 2px 12px rgba(0,0,0,0.25)`.
- Left: play triangle SVG 11×11px, fill `#0D1E16`.

Shuffle button (calls `shuffle()`, disabled when no queue):
- Background: `rgba(255,255,255,0.1)`. Border: `1px solid rgba(255,255,255,0.2)`. Color: white. Padding: 11px 18px. Border-radius: 24px. Font: 13px, weight 600.
- Left: shuffle SVG 14×14px, stroke white.

### Playlist Type Section

**Label**: `"Playlist Type"` (i18n key: `listen.hero.playlistTypeSection`) — 10px, weight 700, letter-spacing 0.09em, uppercase, `$lc-text-hint`, margin-bottom 10px. Padding: 0 18px.

**3-column grid** (`display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 18px 16px`):

Each mode card button (`[class.active]="listenStore.playMode() === m.value"`, calls `setMode(m.value)`):
- Flex column, align-center. Padding: 14px 8px 12px. Border-radius: 16px.
- **Inactive**: `border: 1.5px solid rgba(45,90,78,0.12)`, `background: white`.
- **Active**: `border: 1.5px solid #2D5A4E`, `background: #E8F2EE`.

Icon container inside each card: 34×34px, border-radius 11px.
- **Inactive**: `background: #E8F2EE`, icon stroke `#4A8C7A`.
- **Active**: `background: #2D5A4E`, icon stroke `white`.

Icon SVGs (16×16px):
- Compact: two horizontal lines (list icon).
- Examples: speech bubble.
- Deep Dive: info circle `ⓘ`.

Title text: 12px, weight 600. **Inactive**: `#1A2B26`. **Active**: `#2D5A4E`.
Sub text: 9px. **Inactive**: `#9BAAA6`. **Active**: `#4A8C7A`. Line-height 1.3.

Copy:
| Mode | Title | Sub |
|---|---|---|
| compact | Compact | Word + meaning |
| examples | Examples | Full sentences |
| deepDive | Deep Dive | + grammar |

### Speed Chip Row

`display: flex; align-items: center; gap: 7px; padding: 0 18px 20px`.

Label: `"SPEED"` — 10px, weight 700, letter-spacing 0.07em, `$lc-text-hint`.

Speed chips for `LISTEN_SPEEDS_EXTENDED` (`[0.75, 0.95, 1, 1.25, 1.5]`), calls `setSpeed(s)`:
- Padding: 5px 13px. Border-radius: 20px. Font: 10px, weight 700. Font-family: DM Sans.
- **Inactive**: `border: 1px solid rgba(45,90,78,0.15)`, `background: white`, color `#6B7C78`.
- **Active**: `border: 1px solid #2D5A4E`, `background: #2D5A4E`, color `white`.

### Queue Header

`display: flex; justify-content: space-between; align-items: center; padding: 0 18px 10px`.
- Left: `"Queue ({{ listenStore.queue().length }})"` — 12px, weight 600, `#1A2B26`.
- Right: `~{{ listenStore.estimatedMinutes() }} min` — 10px, `#9BAAA6`.

### Queue List

`padding: 0 16px 32px; display: flex; flex-direction: column; gap: 8px`.

Empty state (when `!queueCount()`):
- Centred column. Icon: 🎧 (32px). Title: i18n `listen.queue.emptyTitle`, 15px, weight 600, `#1A2B26`. Sub: i18n `listen.queue.emptyDesc`, 12px, `#9BAAA6`.

Each queue card row (for `card of listenStore.queue()`):
- `background: white`. `border: 1px solid rgba(45,90,78,0.1)`. `border-radius: 16px`. Padding: 12px 14px.
- `display: flex; align-items: center; gap: 10px`.
- `box-shadow: 0 2px 8px rgba(45,90,78,0.05)`.

Left body (flex: 1, min-width 0):
- Word row (flex, gap 6px, margin-bottom 3px): `<lc-article-badge>` (if `card.content.article`) + word text 14px weight 600 `#1A2B26`, truncated.
- Translation: 11px, `#6B7C78`, margin-bottom 4px.
- Meta row (flex, gap 5px): category chip (8px weight 700 uppercase `#4A8C7A` on `#E8F2EE` bg, padding 2px 7px, radius 10px) + SRS state label (9px `#9BAAA6`).

Right: audio preview button 32×32px, border-radius 9px, `background: #F4F1E9`, `border: 1px solid rgba(45,90,78,0.1)`. Speaker SVG 13×13px, stroke `#9BAAA6`. Calls `playCardAudio(card)`.

---

## Screen 2 — Now Playing (`now-playing.page.html`)

### Layout

Full-screen dark view. Background: `#0D1A13`. Flex column. No scroll.

```
ion-header (no border)
  toolbar → nav bar (dark)
word card (frosted glass)
teleprompter area (flex: 1)
progress bar
mode tab row
speed chip row
transport controls
```

### Nav Bar (dark)

Background transparent / `#0D1A13`. Flex row, space-between, align-center. Padding: 10px 18px 14px.

**Back button** (calls `goBack()`): 40×40px circle, `background: rgba(255,255,255,0.07)`, no border. Left chevron SVG, stroke `rgba(255,255,255,0.75)`, stroke-width 2.2.

**Centre**: flex row, gap 8px, align-center.
- Animated bars (4 bars, 2.5px wide, `background: #6EE7B7`, `border-radius: 1.5px`, `transform-origin: bottom`):
  - When `isPlaying()`: animate with keyframes — bar heights cycle between ~35%–100% of max height (14px). Use 4 independent `@keyframes` with slightly different durations (0.65–0.8s) and delays (0–0.18s), `animation-iteration-count: infinite`, `animation-timing-function: ease-in-out`.
  - When paused: bars static at their base heights [8, 14, 6, 12]px.
- Label: `"Now Playing"` (i18n `listen.nowPlaying.pageTitle`) — 11px, weight 700, letter-spacing 0.08em, uppercase, `rgba(255,255,255,0.5)`.

**More button**: 40×40px circle, same bg as back. ⋮ SVG fill `rgba(255,255,255,0.6)`.

### Word Card (frosted glass)

Margin: 0 16px 16px. `background: rgba(255,255,255,0.055)`. `border: 1px solid rgba(255,255,255,0.08)`. `border-radius: 26px`. Padding: 26px 24px 22px. Flex column, align-center. Position relative, overflow hidden.

**Radial glow** (position absolute, pointer-events none): centered, 240×200px, `background: radial-gradient(ellipse, rgba(74,140,122,0.14), transparent 70%)`.

**Card position badge** (position absolute, top 14px, right 16px): `"{{ listenStore.cardIndex() + 1 }} / {{ listenStore.queue().length }}"` — 10px, weight 600, `rgba(255,255,255,0.28)`, letter-spacing 0.04em.

**Article badge** (`<lc-article-badge>` if `currentCard()?.content?.article`): margin-bottom 14px. Existing component, no changes needed.

**German word**: `{{ currentCard()?.content?.back }}` — Lora, `clamp(22px, 9vw, 38px)`, weight 600, `#F5F0E8`, text-align center, line-height 1.2, margin-bottom 9px.

**English translation**: `{{ currentCard()?.content?.front }}` — 16px, weight 500, `rgba(110,231,183,0.85)`, text-align center.

### Teleprompter Area

`padding: 0 18px; margin-bottom: 16px; flex: 1; display: flex; flex-direction: column; justify-content: center`.

Driven by `segmentViewModels()` computed array (already in `NowPlayingPage`). The VM has `{ text, langLabel, cls: '' | 'played' | 'playing' }`.

**Previous segment** (`cls === 'played'`, show only the last played segment):
- Text-align center. Padding: 8px 12px. `opacity: 0.6`. Transition: opacity 0.3s.
- Font: 13px, `rgba(255,255,255,0.35)`, line-height 1.55, font-style italic.
- If no previous segment: `opacity: 0`.

**Current segment** (`cls === 'playing'`):
- `background: rgba(255,255,255,0.08)`. `border: 1px solid rgba(255,255,255,0.1)`. `border-radius: 16px`. Padding: 14px 16px. Margin: 4px 0.
- Flex row, align-items flex-start, gap 11px.
- Left dot: 9×9px circle, `background: #6EE7B7`, margin-top 6px, flex-shrink 0.
  - When `isPlaying()`: `animation: pulse-dot 1.1s ease-in-out infinite` (keyframe: 0%/100% opacity 1 scale 1, 50% opacity 0.5 scale 0.75).
  - When paused: no animation.
- Right column (flex 1):
  - Text: 16px, weight 500, `#F5F0E8`, line-height 1.55, margin-bottom 4px.
  - Lang label: 9px, weight 700, letter-spacing 0.08em, uppercase, `rgba(110,231,183,0.65)`.

**Next segment** (`cls === ''`, show only the first upcoming segment):
- Text-align center. Padding: 8px 12px. `opacity: 1`. Transition: opacity 0.3s.
- Font: 13px, `rgba(255,255,255,0.45)`, line-height 1.55.
- If no next segment: `opacity: 0`.

> **Implementation note**: the `segmentViewModels()` array contains all non-silence segments. Render only 3 at a time: the last `played` item, the single `playing` item, and the first upcoming `''` item. This gives the teleprompter effect. Use `@if` guards around each row rather than rendering all items.

**Grammar pill** (deepDive mode, `grammarNote()` non-empty — already in existing TS):
- Flex row, gap 8px, padding 12px 14px, `background: rgba(255,255,255,0.06)`, border-radius 14px, margin-top 8px.
- 💡 icon (not emoji — use an SVG lightbulb for consistency), 16px, fill `#6EE7B7`.
- Text: 12px, `rgba(255,255,255,0.65)`, line-height 1.5.

**Error state** (`isError()` — already in existing TS): keep existing error pill and retry/skip pattern, restyled to dark theme. Error pill: `background: rgba(185,28,28,0.15)`, `border: 1px solid rgba(185,28,28,0.35)`, border-radius 14px, padding 10px 14px. Error text: 12px `rgba(255,100,100,0.9)`. Retry button: small, `background: rgba(185,28,28,0.25)`, color white, radius 8px.

### Progress Bar

`padding: 0 18px 14px`.

Track: `height: 3px`, `background: rgba(255,255,255,0.1)`, border-radius 3px, overflow hidden, margin-bottom 7px.
Fill: `[style.width.%]="progressPercent()"` (uses existing store signal), `background: #6EE7B7`, height 100%, border-radius 3px, `transition: width 0.4s ease`.

Labels row (flex, space-between):
- Left: `{{ listenStore.cardIndex() + 1 }} / {{ listenStore.queue().length }}` — 10px, `rgba(255,255,255,0.3)`, weight 500.
- Right: `~{{ listenStore.estimatedMinutes() }} min left` — same style.

### Mode Tab Row

`display: flex; gap: 6px; padding: 0 16px 12px`.

Each tab button (calls `setMode(m.value)`): `flex: 1`. Padding: 8px. Border-radius: 11px. Text-align center. Font: 10px, weight 600.
- **Inactive**: `border: 1px solid rgba(255,255,255,0.11)`, `background: rgba(255,255,255,0.04)`, color `rgba(255,255,255,0.5)`.
- **Active**: `border: 1px solid rgba(110,231,183,0.42)`, `background: rgba(110,231,183,0.1)`, color `#6EE7B7`.

Labels: Compact / Examples / Deep Dive.

### Speed Chip Row (dark variant)

`display: flex; align-items: center; gap: 7px; padding: 0 16px 16px`.

Label `"SPEED"`: 10px, weight 700, letter-spacing 0.07em, `rgba(255,255,255,0.28)`.

Chips (same speeds as hub):
- **Inactive**: `border: 1px solid rgba(255,255,255,0.15)`, `background: transparent`, color `rgba(255,255,255,0.42)`.
- **Active**: `border: 1px solid rgba(110,231,183,0.42)`, `background: rgba(110,231,183,0.15)`, color `#6EE7B7`.

### Transport Controls

`display: flex; align-items: center; justify-content: space-between; padding: 6px 22px 32px`.

**Shuffle** (calls `toggleShuffle()`): 46×46px circle, transparent bg, no border.
- SVG 22×22px. **Inactive**: stroke `rgba(255,255,255,0.4)`. **Active** (`isShuffled()`): stroke `#6EE7B7`.

**Previous** (calls `previous()`): 50×50px circle, `background: rgba(255,255,255,0.07)`, `border: 1px solid rgba(255,255,255,0.1)`. Skip-back SVG 19×19px, stroke `rgba(255,255,255,0.7)`.

**Play / Pause** (calls `togglePlay()`): 66×66px circle, `background: white`, no border.
- `box-shadow: 0 4px 24px rgba(110,231,183,0.28), 0 2px 8px rgba(0,0,0,0.3)`.
- When `isPlaying()`: pause icon (two rects), fill `#0D1A13`, 22×22px.
- When paused: play triangle, fill `#0D1A13`, 22×22px.
- When `isError()`: warning circle SVG, stroke `#0D1A13`.

**Next** (calls `next()`): 50×50px circle, same as previous. Skip-forward SVG.

**Repeat** (calls `toggleRepeat()`): 46×46px circle, transparent bg, no border.
- SVG 22×22px. **Inactive**: stroke `rgba(255,255,255,0.4)`. **Active** (`isRepeat()`): stroke `#6EE7B7`.

---

## Screen 3 — Session Complete (`listen-complete.page.html`)

### Layout

Background `$lc-ss-paper` (`#F4F1E9`). Flex column, full height. `ion-content` scrollable.

### Nav Bar

Centred label only: `"Session Complete"` (i18n `listen.complete.title`) — 11px, weight 700, letter-spacing 0.08em, uppercase, `#9BAAA6`.

### Body (`padding: 20px 24px 32px; display: flex; flex-direction: column; align-items: center`)

**Checkmark circle**: 84×84px, `border-radius: 50%`, `background: linear-gradient(135deg, #2D5A4E, #4A8C7A)`, `box-shadow: 0 8px 28px rgba(45,90,78,0.32)`. Margin-bottom 20px, margin-top 12px.
- SVG checkmark 38×38px, stroke white, stroke-width 2.5.

**Headline**: `"All done!"` — Lora, 30px, semibold, `#1A2B26`, margin-bottom 6px.

**Sub-line**: `"You listened through {{ queueCount() }} words"` — 13px, `#9BAAA6`, margin-bottom 24px, text-align center.

**Mode badge** (inline-flex, align-center, gap 7px):
- `background: white`. `border: 1px solid rgba(45,90,78,0.15)`. `border-radius: 22px`. Padding: 7px 16px. Margin-bottom 24px.
- Speaker icon 13×13px, stroke `#2D5A4E`. Label: `playModeLabel()` — 12px, weight 600, `#2D5A4E`.
- `box-shadow: 0 2px 8px rgba(45,90,78,0.07)`.

**Stats grid** (`display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-bottom: 28px`):

Each stat card: `background: white`, `border: 1px solid rgba(45,90,78,0.1)`, `border-radius: 18px`, padding: 18px 16px, `box-shadow: 0 2px 8px rgba(45,90,78,0.05)`.
- Number: Lora, 28px, semibold, `#1A2B26`, line-height 1, margin-bottom 4px. (Speed stat uses `#2D5A4E` for the number.)
- Label: 10px, `#9BAAA6`, weight 500.

| Stat | Value | Label |
|---|---|---|
| Words listened | `{{ queueCount() }}` | Words listened |
| Time spent | `{{ elapsedMinutes() }}m` | Time spent |
| Speed | `{{ listenStore.speed() }}×` | Playback speed |
| SRS | `0` | SRS changes |

**Listen again CTA** (calls `listenAgain()`):
- Width 100%. `background: linear-gradient(135deg, #2D5A4E, #3A7062)`. Color white. Border: none. Border-radius: 16px. Padding: 16px. Font: 14px, weight 600. Margin-bottom 10px.
- `box-shadow: 0 4px 18px rgba(45,90,78,0.28)`.
- Left: shuffle SVG 14×14px, stroke white. Label: `"Listen again (reshuffled)"`.

**Back to home** (calls `goBack()`):
- Width 100%. `background: transparent`. Color `#6B7C78`. `border: 1px solid rgba(45,90,78,0.18)`. Border-radius: 16px. Padding: 14px. Font: 13px, weight 500.

---

## Screen 4 — Playlist Source Sheet (`playlist-source-sheet.component.html`)

### Layout

Ionic modal sheet. Handle at top. White background. `border-radius: 26px 26px 0 0`. `box-shadow: $lc-ss-shadow-sheet`.

**Handle**: `width: 38px; height: 4px; background: rgba(45,90,78,0.18); border-radius: 4px`. Padding: 13px 0 6px, centred.

**Title**: `"Choose a source"` — Lora, 19px, semibold, `#1A2B26`. Padding: 4px 20px 18px, text-align center.

**Source rows list**: `padding: 0 16px 36px; display: flex; flex-direction: column; gap: 9px`.

Each source row button:
- `display: flex; align-items: center; gap: 13px; padding: 14px 16px; border-radius: 18px; border: 1.5px solid`.
- **Inactive**: `background: white`, `border-color: rgba(45,90,78,0.1)`.
- **Active** (selected source): `background: #E8F2EE`, `border-color: #2D5A4E`.

Icon container: 46×46px, `border-radius: 13px`. Background per source:
- Due: `#F0F8F4` (inactive) / `#E8F2EE` (active). Icon: clock. Stroke: `#4A8C7A` (inactive) / `#2D5A4E` (active).
- All: `#EAF2FC`. Icon: three lines. Stroke: `#1A56A3` (inactive) / `#2D5A4E` (active).
- Struggling: `#FEF2F2`. Icon: shield. Stroke: `#B91C1C` always.
- Collection: `#F1EFE8`. Icon: table grid. Stroke: `#5F5E5A` (inactive) / `#2D5A4E` (active).

Middle text column (flex 1, text-align left):
- Title: 14px, weight 600. **Inactive**: `#1A2B26`. **Active**: `#2D5A4E`. Margin-bottom 2px.
- Subtitle: 11px, `#9BAAA6`.

Right count: Lora, 19px, semibold. **Inactive**: `#1A2B26`. **Active**: `#2D5A4E`. (Struggling always `#B91C1C`. Collection shows `—` in `#9BAAA6`.)

Active checkmark (only on selected row): 22×22px circle, `background: #2D5A4E`, flex-shrink 0. White checkmark SVG 11×11px, stroke-width 2.8.

Source counts come from **existing store computed signals**:
- Due → `listenStore.dueCount()`
- All → `listenStore.allCount()`
- Struggling → `listenStore.strugglingCount()`
- Collection → `listenStore.collectionCounts().get(collectionId)` (shown in the sheet only when a collection was loaded)

Active source → compare against `listenStore.selectedSource()` signal.

---

## Interactions & Behaviour

| Action | Trigger | Handler (no changes) |
|---|---|---|
| Open source sheet | Tap source pill | `openSourceSheet()` → `ModalController` |
| Play queue | Tap Play | `play()` → `router.navigate(['/listen/now-playing'])` |
| Shuffle queue | Tap Shuffle | `shuffle()` → same route |
| Change mode (hub) | Tap mode card | `setMode(m.value)` |
| Change speed (hub) | Tap speed chip | `setSpeed(s)` |
| Back from player | Tap ← | `goBack()` — stops audio, pauses, nav back |
| Play / Pause | Tap big button | `togglePlay()` — pauses / resumes / retries |
| Previous card | Tap ⏮ | `previous()` |
| Next card | Tap ⏭ | `next()` |
| Toggle shuffle | Tap shuffle icon | `toggleShuffle()` |
| Toggle repeat | Tap repeat icon | `toggleRepeat()` |
| Change mode (player) | Tap mode tab | `setMode(m.value)` |
| Change speed (player) | Tap speed chip | `setSpeed(s)` |
| Session ends | Store `status === 'complete'` | Auto-redirect to `/listen/complete` (existing `_redirectEffect`) |
| Listen again | Tap CTA | `listenAgain()` → `restartWithShuffle()` |
| Back from complete | Tap CTA | `goBack()` → `resetToIdle()` |

### Animations

| Element | Animation | Details |
|---|---|---|
| Player audio bars | `@keyframes bars1–4` | Each bar cycles `scaleY` between ~0.3 and 1. Durations 650–800ms. Delays 0–180ms. Only runs when `isPlaying()`. |
| Teleprompter dot | `@keyframes pulse-dot` | `opacity` 1→0.5→1, `scale` 1→0.75→1, 1.1s ease-in-out infinite. Only runs when `isPlaying()`. |
| Progress fill | CSS transition | `transition: width 0.4s ease` |
| Source sheet | Slide up | `animation: sheet-up 0.28s cubic-bezier(0.2,0.8,0.2,1)` on the sheet; `animation: fade-in 0.2s` on the scrim. These are Ionic modal animations — configure via the `cssClass: 'pss-modal'` and the existing global CSS for that class. |

### Error State (Now Playing)

When `isError()`:
- Play button shows warning icon instead of play/pause.
- Error pill appears below teleprompter with retry button.
- "Skip card" text link appears below error pill.
- Calls `retrySegment()` or `skipCard()` — no changes to TS.

---

## State Management

**No store changes.** All state lives in `ListenStore` (NgRx Signal Store). The templates read these signals:

| Signal | Used in |
|---|---|
| `sourceLabel()` | Hub source pill, hub hero |
| `estimatedMinutes()` | Hub hero, hub queue header, player progress |
| `queue()` | Hub queue list, player progress |
| `cardIndex()` | Player progress, player card position |
| `segmentIndex()` | Teleprompter (via `segmentViewModels()` computed in `NowPlayingPage`) |
| `currentCard()` | Player word card |
| `progressPercent()` | Player progress fill |
| `playMode()` | Mode tab active state |
| `speed()` | Speed chip active state |
| `isShuffled()` | Shuffle button active state |
| `isRepeat()` | Repeat button active state |
| `status()` | `isPlaying()`, `isError()` in `NowPlayingPage` |
| `dueCount()`, `allCount()`, `strugglingCount()` | Source sheet row counts |
| `selectedSource()` | Source sheet active row |
| `queueCount()` | Complete screen stat |
| `elapsedMinutes()` | Complete screen stat (signal on `ListenCompletePage`) |
| `playModeLabel()` | Complete screen mode badge (computed on `ListenCompletePage`) |

---

## Design Tokens

All tokens are already in `src/theme/_tokens.scss`. Use them instead of hardcoded hex values where possible.

| Value used in design | Token |
|---|---|
| `#F4F1E9` | `$lc-ss-paper` |
| `#2D5A4E` | `$lc-brand` |
| `#E8F2EE` | `$lc-brand-light` |
| `#4A8C7A` | `$lc-brand-mid` |
| `#1A3830` | `$lc-brand-dark` |
| `#6EE7B7` | `$lc-mastery-3` (or `$lc-ss-mint`) |
| `#1A2B26` | `$lc-text-primary` |
| `#6B7C78` | `$lc-text-secondary` |
| `#9BAAA6` | `$lc-text-hint` |
| `rgba(45,90,78,0.12)` | `$lc-border` |
| `rgba(45,90,78,0.24)` | `$lc-border-strong` |
| `0 2px 12px rgba(45,90,78,0.08)…` | `$lc-shadow-card` |
| `0 8px 32px rgba(45,90,78,0.14)…` | `$lc-shadow-float` |
| `0 -12px 40px rgba(0,0,0,0.35)` | `$lc-ss-shadow-sheet` |
| `white` / `#FFFFFF` | `$lc-card` |
| `'Lora', Georgia, serif` | `$lc-font-display` |
| `'DM Sans', system-ui, sans-serif` | `$lc-font-body` |
| `#EAF2FC` / `#1A56A3` / `#85B7EB` | `$lc-masc-*` (der) |
| `#FEF2F2` / `#B91C1C` / `#FCA5A5` | `$lc-fem-*` (die) |
| `#F1EFE8` / `#5F5E5A` / `#B4B2A9` | `$lc-neut-*` (das) |
| `250ms cubic-bezier(0.4,0,0.2,1)` | `$lc-duration-base` + `$lc-easing-standard` |

Dark player surface `#0D1A13` is **new** — not in tokens yet. Add it as `$lc-listen-player-bg: #0D1A13` in the listen feature SCSS or directly in `_tokens.scss` under a `// ─── LISTEN PLAYER ───` block.

---

## Assets

- **Icons**: all inline SVG. No external icon library needed.
- **Fonts**: `Lora` and `DM Sans` — already loaded in the app (`$lc-font-display`, `$lc-font-body`).
- **`<lc-article-badge>`**: existing component — use as-is in both hub queue rows and the player word card.

---

## Files in This Package

| File | Description |
|---|---|
| `README.md` | This document |
| `Listen Player.dc.html` | Interactive HTML prototype — open in any browser to see all 4 screens |

---

## Quick-start checklist for the developer

1. Open `Listen Player.dc.html` in a browser. Tap **Play** on the hub to see the Now Playing screen. Tap **← back** to return. Play through all 6 cards to reach the Session Complete screen.
2. Replace `listen.component.html` + `listen.component.scss` with the Hub design.
3. Replace `now-playing.page.html` + `now-playing.page.scss` with the Now Playing design.
4. Replace `listen-complete.page.html` + `listen-complete.page.scss` with the Session Complete design.
5. Replace `playlist-source-sheet.component.html` + `.scss` with the Source Sheet design.
6. Add `$lc-listen-player-bg: #0D1A13` to `_tokens.scss`.
7. Add the `@keyframes bars1–bars4` and `pulse-dot` animations to the Now Playing SCSS.
8. Verify no TypeScript changes were needed — if you find yourself touching `.ts` files, something is wrong.
