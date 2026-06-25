# Handoff: Vault — "Lexicon" Premium Redesign (LinguaCard)

## Overview
A full, ground-up redesign of LinguaCard's **Vault** feature (word & collection management) in a new premium, editorial visual identity called **Lexicon**. It replaces the confusing Words/Collections tab toggle with a single, calm **library model**: a focus hero that answers "what should I study now?", collections as first-class "shelves", and a global word index that's always one tap away.

Target platform: the existing **Capacitor + Ionic + Angular** mobile app (`linguaCard/apps/mobile`). Design width ≈ 392px (iPhone).

## About these files
The files here are **design references created in HTML** — a working, click-through prototype of the intended look & behavior. They are **not production code to copy verbatim**. The task is to **recreate these designs inside the existing LinguaCard codebase** (Angular standalone components + Ionic, the patterns already under `apps/mobile/src/app/features/vault`), reusing its routing, stores, audio layer and API. Treat the HTML as the source of truth for *appearance & interaction*, the codebase as the source of truth for *architecture*.

- `Vault.dc.html` — editable source (template markup + a JS logic class with all state & sample data). Read this for exact markup and logic.
- `Vault.html` — self-contained offline build. Open in any browser to click through every screen.
- `screenshots/` — reference renders of every screen.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, shadows and interactions are intentional and should be reproduced faithfully. All hex/size/copy values below are exact.

---

## The new model (the most important change)
The current Vault forces a binary **Words ⇄ Collections** tab toggle and buries "what to study". The redesign is a **single vertical scroll**:

1. **Focus hero** — one dark, premium card: total **due** count, a 12-day streak chip, a stacked mastery-distribution bar, and the primary **Start review** + **Listen** actions. This is the answer to "what now?".
2. **All Words** — a pinned index card → opens the **Word Index** (search + filters + full list).
3. **Collections** — first-class "shelves": cover-gradient cards with emoji, name, word/mastered counts, a mastery meter and an urgency-tinted due badge.

Drill-down: Vault → (a collection **or** All Words) → a word. The orphaned standalone Collections page is retired; collection cards live only in the Vault. Back-nav from a collection returns to the Vault.

---

## Design Tokens (Lexicon)

> Lexicon is a **self-contained palette** for the Vault redesign. Add it scoped to `features/vault/*` (mirroring how `$lc-ss-*` Story Studio tokens were added) — do not overwrite the app-wide brand palette.

### Colors
| Token (suggested) | Hex | Usage |
|---|---|---|
| `$lc-vx-paper` | `#F4EFE4` | screen background |
| `$lc-vx-card` | `#FFFCF6` | cards, list rows, inputs |
| `$lc-vx-ink` | `#211C16` | primary text, dark buttons, All-Words tile |
| `$lc-vx-ink-soft` | `#5A5347` | strong meta |
| `$lc-vx-muted` | `#8A7F6E` | secondary text |
| `$lc-vx-hint` | `#9A8F7C` | mono eyebrows, tiny labels |
| `$lc-vx-forest` | `#1F4034` | primary buttons, hero base, brand green |
| `$lc-vx-forest-deep` | `#15281F` | hero gradient end |
| `$lc-vx-green` | `#2E6B52` | mastery/“mastered” values, meter end |
| `$lc-vx-brass` | `#B68A4E` | premium accent (FAB, highlights); deep `#A06E32`, text-on-light `#8A6636` |
| `$lc-vx-brass-glow` | `rgba(182,138,78,.32)` | hero radial glow |
| `$lc-vx-rust` | `#B5582E` | due / urgency text; bg `#F7E9E0` border `#EAC9B6` |
| hairline | `rgba(33,28,22,.08–.12)` | borders, dividers |

**Article badges** (refined, muted): der → bg `#E9EFF7` text `#3B5C86`; die → bg `#F5E9EC` text `#9B4A57`; das → bg `#EFEADF` text `#74695A`; none → bg `#ECE7DB` text `#8A7F6E`.

**Mastery scale (0–5)** — left strip + ring color, labels: `0 #C9BBA6 New`, `1 #D89B6A Seen`, `2 #D9B45E Learning`, `3 #9DB082 Familiar`, `4 #5E8E6E Strong`, `5 #2E6B52 Mastered`.

**Collection cover gradients** (`linear-gradient(150deg, …)`): Travel `#1F4034→#3E6B5A`; Food `#7C4A2E→#B07A45`; Work `#2E3A54→#5A6E8C`; Daily `#4A5640→#7E8C6A`; Idioms `#5A3A52→#8C6A84`.

### Typography (NEW — introduce these fonts)
- **Display serif: `Spectral`** (Google) — weights 300/400/500/600 + italic. Used for the wordmark, all headwords, big numbers, titles, example sentences. Sizes: Vault title 34/500; hero number 64/500; word headword 38/600; section titles 21/500; row headwords 15.5/500; stat numbers 17–24/600.
- **UI sans: `Hanken Grotesk`** (Google) — 400/500/600/700. Body, meta, buttons, chips, nav.
- **Mono: `Spline Sans Mono`** (Google) — 500/600. Tiny **uppercase eyebrows** (letter-spacing 1.5–3px), count badges, article badges, stat labels. This mono is the signature "premium technical" detail — use it for all small caps labels and numeric badges.

### Spacing / radius / shadow
- Screen gutters: 20px (lists 16px). Card gaps 12px.
- Radii: hero 26px; cards 18–22px; rows 15px; pills 20px; sheets 26px top; FAB/buttons 14–15px; phone frame 52px.
- Card shadow: `0 8px 22px -16px rgba(33,28,22,.5), 0 1px 2px rgba(0,0,0,.03)`.
- Hero shadow: `0 22px 44px -22px rgba(20,30,24,.85)`.
- FAB shadow: `0 12px 28px -6px rgba(160,110,50,.7)`.
- Sheet shadow: `0 -16px 50px rgba(0,0,0,.3)`.

### Animations
- Sheets slide up: `translateY(101%)→0`, `.3s cubic-bezier(.2,.8,.2,1)`; scrim fade `.2s`.
- FAB items stagger in (opacity+translateY), 40ms apart; FAB icon rotates 0→45°.
- Toast: fade+rise, auto-dismiss ~1.7s.

---

## Screens

### 1. Vault Home (`vault.page`)
- **Header:** mono eyebrow `YOUR LEXICON` (brass) over `Vault` (Spectral 34). Right: 42px circle search button → Word Index.
- **Focus hero** (dark forest gradient, brass radial glow): mono `READY TO REVIEW` + streak chip (brass dot). Big Spectral due-count + italic "words due". Sub: "Across N collections · best studied now". **Mastery distribution bar** = 6 stacked segments (mastery colors) with "X mastered of Y" + brass %. Buttons: **Start review** (paper fill) + **Listen** (ghost). Maps to existing review/listen entry points.
- **All Words card:** ink tile (list icon) + "All Words" / "Browse & search your full index" + total count + chevron → Word Index.
- **Collections:** Spectral "Collections" + mono `N SHELVES`. Each card: 78px cover (gradient + emoji + mono category tag) | body = name (Spectral) + due badge (urgency-tinted: red ≥50% due, amber ≥20%, green otherwise) + "N words · M mastered" + mastery meter (green gradient). Tap → Collection Detail.
- **FAB** (brass, bottom-right) → speed-dial: Add a word / New collection / Import.

### 2. Word Index (the global list — `vault.page` "All words" state)
- Back → Home. Spectral "All Words" + mono result count.
- **Search** field (German or English). **Filter chips:** All / Due / New / Mastered, each with a mono count badge (Due badge is rust-tinted). Active chip = ink fill.
- **Word rows:** mastery left-strip (color by level) + mono article badge + headword (Spectral) + translation; trailing `DUE` pill (rust) or mastery label. Tap → Word Detail.

### 3. Collection Detail (`collection-detail.page`)
- Full-bleed cover hero (collection gradient): back + overflow (⋯); emoji + mono category + name (Spectral 27).
- **Overlapping stats card** (-14px): Words / **Due** (rust) / **Mastered %** (green), divided. Buttons: **Review N** (forest) + **Listen** (sand).
- Category chips (All / Nouns / Verbs / Phrases). Word rows (same component as Index). FAB → add word to this collection.

### 4. Word Detail (`word-detail`)
- Nav: back / mono `WORD` / overflow.
- **Headword block:** article badge + italic Spectral phonetic; big Spectral headword (38); translation; full-width ink **Listen to pronunciation** button (mint "ready" dot).
- **Mastery card:** progress ring (mastery color, level number center) + "Level N — Label" + next-review line; 4-up stat grid (Reviews / Recall / Stability / Last seen) on paper tiles.
- **Examples card:** each sentence = Spectral German with a brass left-rule + italic English; a `💡` note tile.
- **Related words:** article badge + headword + gloss rows.
- (Bottom action bar in the real app: Rate / Edit / Delete — keep existing.)

### 5. Add Word sheet (`add-word-sheet`)
Slide-up sheet: Cancel / "Add a word" / Save. Fields with mono labels: **German** (+ brass **Auto-fill**), **Article** segmented (—/der/die/das, gender-tinted active), **English**, **Collection** picker, **Category** chips, **Example sentence** (German + English). Sticky **Save word** (forest).

### 6. Import sheet
Slide-up: "Import words" + three premium options — **From a CSV file**, **From a photo**, **Paste a list** — each a tinted icon tile + title + sub + chevron. Wire to existing CSV/image import routes.

### 7. FAB speed-dial
Brass FAB expands to 3 labeled mini-actions over a blurred scrim; icon rotates to ✕. (Mirrors the existing `SpeedDialFabComponent` contract.)

### Bottom nav (app shell)
Home / **Vault** (active, forest) / Review / Stories / Listen. Wire to real routes.

---

## Mapping to the codebase
Recreate using the existing data the Vault already exposes (no store changes needed):
- Collections: `collectionStore.collections()` → `{name, emoji, cardCount, dueCount, masteredCount, importStatus}`. Urgency = `dueCount/cardCount` (≥.5 high, ≥.2 medium). Mastery % = `masteredCount/cardCount`.
- Words: `cardStore` cards → `{content:{article, back, front, phonetic, examples, notes}, srsState:{masteryLevel, state, nextDueAt, repetitions}, categoryIds, tags}`. Filters: due = `!nextDueAt || nextDueAt<=now`; new = `state==='new'`; mastered = `state==='mastered'`.
- Existing methods to reuse: `openAddWord()`, `openCreateCollection()`, `openImportSheet()`, `openCollectionDetail()`, `openDetail()`, `startReview()`, `startListen()`, `setMasteryFilter()`, `onSearch()`.

## Sample data
The prototype ships representative German A1–B1 vocabulary (Reise & Bahn, Deutsche Küche, Im Büro, Alltag, Redewendungen). Replace all of it with live store data.

## Assets
- **Fonts:** Spectral + Hanken Grotesk + Spline Sans Mono (Google) — add to the app's font loading. These are NEW to the app and core to the Lexicon identity.
- **Icons:** inline stroke SVG; map to Ionicons where equivalents exist.
- **Imagery:** collection covers are CSS gradients (placeholders/fallbacks) — keep as-is or back with real cover art later. No raster assets required.
