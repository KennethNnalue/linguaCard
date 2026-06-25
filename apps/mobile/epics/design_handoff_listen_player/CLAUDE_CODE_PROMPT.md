# Claude Code Prompt — Listen & Learn Player Rebuild (LC-200)

Copy and paste this entire prompt into Claude Code when starting the implementation.

---

## Task

Implement a full visual redesign of the **Listen & Learn** audio feature in the LinguaCard Angular/Ionic app. The design is fully specified in `README.md` (in this handoff folder) and demonstrated interactively in `Listen Player.dc.html` (open it in a browser first).

**Scope:** Replace templates + SCSS only for 4 files. No TypeScript, no store, no routing changes.

## Codebase context

- **Framework:** Angular 17+ with standalone components, Ionic 7, NgRx Signal Store
- **i18n:** `@ngx-translate` — all user-facing strings must use the existing i18n keys (e.g. `'listen.hero.playBtn' | translate`)
- **Design tokens:** `src/theme/_tokens.scss` — always use SCSS variables from this file instead of hardcoded hex values
- **Fonts:** Lora (`$lc-font-display`) + DM Sans (`$lc-font-body`) — already loaded
- **Shared component:** `<lc-article-badge [article]="...">` — use as-is, no changes

## Files to modify

```
src/app/features/listen/pages/listen/listen.component.html       ← Hub screen
src/app/features/listen/pages/listen/listen.component.scss       ← Hub styles
src/app/features/listen/pages/now-playing/now-playing.page.html  ← Player screen
src/app/features/listen/pages/now-playing/now-playing.page.scss  ← Player styles
src/app/features/listen/pages/listen-complete/listen-complete.page.html  ← Complete screen
src/app/features/listen/pages/listen-complete/listen-complete.page.scss  ← Complete styles
src/app/features/listen/components/playlist-source-sheet/playlist-source-sheet.component.html
src/app/features/listen/components/playlist-source-sheet/playlist-source-sheet.component.scss
src/theme/_tokens.scss  ← add ONE new token: $lc-listen-player-bg: #0D1A13
```

**Do NOT modify any `.ts` files.** All logic is already correct. This is a pure visual redesign.

## Step-by-step instructions

### Step 1 — Read the design spec

Read `README.md` in full. It describes every screen section by section: layout, colours (with SCSS token names), typography, border-radii, shadows, interactions, and state bindings. Open `Listen Player.dc.html` in a browser to see the interactive reference.

### Step 2 — Add the new token

In `_tokens.scss`, under the existing `// ─── SURFACES ───` block, add:
```scss
// ─── LISTEN PLAYER ──────────────────────────────────────────────────────────
$lc-listen-player-bg: #0D1A13;  // Dark immersive background for Now Playing
```

### Step 3 — Listen Hub (`listen.component.html` + `.scss`)

Rewrite the template to match the hub screen in the design. Key points:
- Background `$lc-ss-paper`. Typography `$lc-font-display` (Lora) for headlines.
- Source pill row → existing `(click)="openSourceSheet()"` binding stays.
- Dark hero card with Play + Shuffle buttons → existing `play()` and `shuffle()` bindings stay.
- 3-column mode card grid → `@for (m of MODES; track m.value)` loop, `[class.active]="listenStore.playMode() === m.value"`, `(click)="setMode(m.value)"`.
- Speed chip row → `@for (s of SPEEDS; track s)` loop, `[class.active]="listenStore.speed() === s"`, `(click)="setSpeed(s)"`.
- Queue list → existing `@for (card of listenStore.queue(); track card.id)` loop stays. Use `<lc-article-badge>` for articles. `(click)="playCardAudio(card)"` on the preview button stays.

### Step 4 — Now Playing (`now-playing.page.html` + `.scss`)

Rewrite the template to match the player screen. Key points:
- Background `$lc-listen-player-bg` (`#0D1A13`). Full-screen, no scroll, flex column.
- Animated bars in the nav (only animate when `isPlaying()`): 4 bars with independent `@keyframes bars1–4`. Put the keyframes in the SCSS.
- Word card: frosted glass (`rgba(255,255,255,0.055)`), radial glow, article badge + big Lora word + mint translation.
- Teleprompter: render **3 rows** from `segmentViewModels()` — the last `played` segment, the current `playing` segment (with pulsing mint dot), and the first upcoming `''` segment. Use `@if` guards, not a full list.
  - Previous row: `segmentViewModels() | last played` — faded italic.
  - Current row: highlighted box with pulsing dot.
  - Next row: dimmed.
- Progress bar: `[style.width.%]="progressPercent()"` — existing signal.
- Mode tabs: compact pill buttons, active = mint tint.
- Speed chips: dark variant (transparent bg, mint active).
- Transport row: Shuffle / Prev / Play-Pause / Next / Repeat — all existing bindings stay unchanged.
- `@keyframes` to add in SCSS:
  ```scss
  @keyframes bars1 { 0%, 100% { transform: scaleY(0.35); } 45%  { transform: scaleY(1); } }
  @keyframes bars2 { 0%, 100% { transform: scaleY(0.55); } 35%  { transform: scaleY(1); } }
  @keyframes bars3 { 0%, 100% { transform: scaleY(0.25); } 55%  { transform: scaleY(1); } }
  @keyframes bars4 { 0%, 100% { transform: scaleY(0.65); } 40%  { transform: scaleY(1); } }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.75); } }
  ```

### Step 5 — Session Complete (`listen-complete.page.html` + `.scss`)

Rewrite to match the complete screen. Key points:
- Background `$lc-ss-paper`. Centred column layout.
- Large gradient checkmark circle.
- Stats 2×2 grid: `queueCount()`, `elapsedMinutes()`, `listenStore.speed()`, hardcoded `0` for SRS changes.
- Mode badge: `playModeLabel()` computed signal (already in TS).
- Two CTAs: `listenAgain()` and `goBack()` — existing bindings stay.

### Step 6 — Source Sheet (`playlist-source-sheet.component.html` + `.scss`)

Rewrite the modal content. Key points:
- White sheet, `border-radius: 26px 26px 0 0`, drag handle.
- 4 source rows: Due / All / Struggling / Collection.
- Active row: `background: $lc-brand-light`, `border-color: $lc-brand`. Inactive: white, `border: 1px solid $lc-border`.
- Counts from store signals: `listenStore.dueCount()`, `listenStore.allCount()`, `listenStore.strugglingCount()`.
- Active detection: compare against `listenStore.selectedSource()`.
- Checkmark badge (22×22px green circle) only on the active row.
- Existing click handlers for each source stay — check the existing TS for method names.

### Step 7 — Verify

1. Run the app and navigate to `/listen`.
2. Confirm the hub looks like the HTML prototype.
3. Tap Play → confirm dark Now Playing screen, animated bars, teleprompter.
4. Let the session complete → confirm Session Complete screen.
5. Tap the source pill → confirm bottom sheet.
6. Check all existing tests still pass: `ng test`.
7. No TypeScript errors: `ng build --configuration production`.

## Important constraints

- **No TypeScript changes.** If the template needs data the TS doesn't currently expose, use a `computed()` in the component class — but read `README.md` first, because all required signals already exist.
- **Use i18n keys** — don't hardcode English strings in templates.
- **Use `$lc-*` SCSS variables** — don't hardcode hex values (except for `$lc-listen-player-bg` which you're adding).
- **Keep `<lc-article-badge>`** — don't inline the article badge colours.
- **Don't rewrite the store** — `ListenStore` is correct and stable.
