# Handoff: Review Experience — Premium Redesign

## Overview

A full UI/UX redesign of the **Review** feature in LinguaCard (the SRS flashcard review flow). It replaces the old dark‑green review screens with a warm, editorial, "premium" experience consistent with the redesigned Vault, Story Studio, and Listen surfaces.

The redesign delivers:

- A **Review hub** (cards‑due hero, mastery snapshot, leech alert, study‑mode picker, quick‑study filters, recent sessions).
- A **session player** with **three study modes** — Flip & rate (default), Type answer, Listen first.
- A **rich back face** (the flipped German side) that carries the **full card‑detail content** (article/gender, plural + audio, example sentences, usage note, expandable synonyms) — everything from the card‑detail page *except* the mastery‑progress block.
- A **session‑complete** summary, a **Mastery breakdown** screen, a **Session history** screen, a **Custom study** builder, and a **Leeches** (stubborn‑word) manager.

---

## About the Design Files

The files in this bundle are **design references created in HTML/JS** — a working prototype that shows the intended look, motion, and behavior. **They are not production code to copy.** The prototype is built as a single self‑contained "Design Component" (`Review.dc.html`) using inline styles and a small runtime (`support.js`); it is a *visual + behavioral spec*, not an architecture to replicate.

Your task is to **recreate these designs inside the existing LinguaCard app** — **Angular 21 + Ionic 8 + Capacitor** — using its established patterns:

- Build screens as Angular standalone components with `ChangeDetectionStrategy.OnPush` and `input()` signals.
- Style **only** with **LDS tokens** (`apps/mobile/src/theme/_tokens.scss`) and the shared `lc-*` components. **No raw hex / px / shadows** in component SCSS (see `reference/lds-skill.md` for the hard rules).
- Reuse `<lc-article-badge>`, `<lc-mastery-dot>`, `<lc-word-item>`, `<lc-button>`, `<lc-category-chip>`, `<lc-empty-state>` where they fit.
- Wire to the **real review/SRS state** described in `reference/epic-review-system-reconciliation.md` (shared selectors: `isNew/isDue/isMastered/isStruggling/lifecycleState`, `Sm2Service`, session stats facade). Do not re‑derive due/new/mastered counts locally.

### ⚠️ Important: this redesign introduces NEW design tokens

The prototype uses a refined type system and palette that **differ from the current LDS canonical values**. This is intentional and shared across the whole app redesign (Vault, Story Studio, Listen, Review). Before implementing, **align with the team on updating the LDS tokens**, then implement against the tokens (never against the raw values below).

| | Current LDS | Redesign (this prototype) |
|---|---|---|
| Display font | Lora | **Spectral** (serif) |
| Body font | DM Sans | **Hanken Grotesk** |
| Mono font | Fira Code | **Spline Sans Mono** |
| Base surface | (white) | **#F4EFE4** warm cream |
| Card surface | white | **#FFFCF6** warm white |

The exact values are catalogued under **Design Tokens** below so they can be folded into `_tokens.scss` (+ `_dark.scss` dark‑mode overrides).

---

## Fidelity

**High‑fidelity (hifi).** Final colors, typography, spacing, motion, and interactions. Recreate pixel‑for‑pixel using LDS tokens/components. The prototype frame is a **393 × 852 px** logical phone (iPhone 15/16 class); all measurements below are at that scale.

---

## Screens / Views

> Common chrome: status bar is the device's; the app content sits in a scroll container. The hub shows the shared 5‑tab bottom nav (Home · Vault · **Review** (active) · Stories · Listen). Session/sub‑screens hide the tab bar and use a top bar instead.

### 1. Review Hub
**Purpose:** Landing screen — decide what to study and see progress.
**Layout:** vertical scroll, 20px horizontal padding, ~96px bottom padding (clears tab bar). Order top→bottom:

1. **Header row** — left: kicker `DAILY PRACTICE` (mono, 10px, letter‑spacing 3px, color `#8A6636`) above title **"Review"** (Spectral, 34px, weight 500, `#211C16`). Right: a 42px circular icon button (bar‑chart icon) → opens **Mastery**. Button: bg `#FFFCF6`, 1px border `rgba(33,28,22,.13)`, shadow `0 2px 6px -3px rgba(33,28,22,.3)`.
2. **Hero — "Cards due today"** — forest gradient card (`linear-gradient(155deg,#1F4034,#15281F)`), radius 26px, padding 24/22/20, shadow `0 22px 44px -22px rgba(20,30,24,.85)`. Decorative radial brass glow top‑right. Contents:
   - kicker `CARDS DUE TODAY` (mono 10px, `#D8B981`).
   - Row: **progress ring** (96px, brass stroke `#D8B981` 6px on `rgba(244,239,228,.12)` track) with big due count (**142**, Spectral 34px `#F4EFE4`) + `DUE` label; beside it two stats — **86** new words (`#F4EFE4`), **14** need attention (`#E0A35C`), and a muted line `≈ 11 min · best done now`.
   - **Primary CTA** "▶ Start today's review" — cream button (`#F4EFE4`), text `#16281F`, radius 16px, padding 15px, weight 700.
3. **Mastery snapshot** — tappable card (`#FFFCF6`, radius 20, card shadow). Left: 54px ring showing **mastery score %** (green `#2E6B52`). Right: "Your mastery" (Spectral 17px) + "123 of 665 words mastered" (12px `#8A7F6E`). Chevron. → **Mastery** screen.
4. **Leeches callout** — dark gradient card (`linear-gradient(150deg,#2A1B14,#3A2417)`), radius 18. Brass bug icon tile, "**3 leeches detected**" (Spectral 17px `#F4EFE4`) + "Words you keep forgetting — let's fix them". Chevron. → **Leeches** screen. (Only shown when leech count > 0.)
5. **Study mode** — section label `STUDY MODE` (mono 10px). Three radio rows (one selected). Selected row: forest bg `#1F4034`, text `#F4EFE4`. Unselected: `#FFFCF6`, 1.5px border `rgba(33,28,22,.1)`, text `#211C16`. Each: 20px radio circle + label (Hanken 14.5px bold) + sub (11.5px). Options:
   - **Flip & rate** — "Recall, reveal, self‑grade" (default)
   - **Type answer** — "Write it — proves spelling & gender"
   - **Listen first** — "Hear it, recall the meaning"
6. **Quick study** — header "Quick study" (Spectral 19px) + `PICK A FOCUS` (mono). Three rows (`#FFFCF6` cards): icon tile + title + sub + count + chevron:
   - **Struggling cards** — "Failed 3+ times — break through", count **32**, red `#B5582E`, tile bg `#F5E5E0`.
   - **New words only** — "Never‑reviewed vocabulary", count **86**, brass `#8A6636`, tile bg `#F1EBDD`.
   - **Custom study** — "Build a filtered session", green `#2E6B52`, tile bg `#E7EFE9` → **Custom study** screen.
7. **Recent sessions** — header + `SEE ALL →` (→ **History**). Two compact rows (`#FBF7EF`): status dot + title + meta (e.g. "Today · 24 cards · 9m") + right side **Nailed** (green) and **Struggled** (amber) counts. *(Note: an opaque "AVG 3.9" score was deliberately removed in favor of Nailed/Struggled, which are actionable.)*

### 2. Session — Top bar & progress (all modes)
- Top bar: left 40px circular **✕** (end session → hub); center kicker = card category (mono 9px) + "Card {n} of {total}" (Spectral 15px); right small "{remaining}↑" counter (mono, `#8A6636`).
- **Progress bar**: 5px track `rgba(33,28,22,.09)`, fill `linear-gradient(90deg,#2E6B52,#D8B981)`, width = `((idx + (flipped?0.5:0)) / total) * 100`%, transition `width .4s cubic-bezier(.4,0,.2,1)`.
- Card scene fills remaining height (flex column), 16px side padding.

### 2a. Front face · FLIP & RATE (default)
Full‑height card (`#FFFCF6`, radius 28, float shadow `0 24px 50px -28px rgba(33,28,22,.7), 0 2px 6px rgba(0,0,0,.05)`, padding 22/22/20):
- Top row: `YOUR LANGUAGE` (mono) · "🇬🇧 English" chip (bg `#E9EFF7`, text `#3B5C86`, pill).
- Center: `WHAT IS THE GERMAN FOR` (mono 9px `#C2B7A2`) + prompt (English) in **Spectral 38px weight 600** + italic hint "try to recall it before revealing".
- CTA "⌄ Reveal German" — forest `#1F4034`, text `#F4EFE4`, radius 16. Has the **gold pulse** animation (`rvPulse`, keyframe pulsing box‑shadow `rgba(216,185,129,.5)` → transparent, 2.4s infinite).

### 2b. Front face · TYPE ANSWER
Same card shell:
- Top row: `WRITE IT FROM MEMORY` · "⌨ Type" chip.
- Center: `TYPE THE GERMAN FOR` + prompt (Spectral 30px).
- **Text input** — centered Spectral 26px `#1F4034`, bg `#F4EFE4`, 1px border + 2px bottom border `#2E6B52`, radius 12, padding 13/12. Placeholder: "Type in German — incl. der/die/das". `autocapitalize/autocorrect/spellcheck` all off.
- **Accent key row** — four 46×40 buttons: **ä ö ü ß** (Spectral 19px), bg `#FBF7EF`, border `rgba(33,28,22,.1)`, radius 11. Tapping appends the character to the input. *(This is a deliberate UX feature — typing German umlauts is the #1 friction point.)*
- CTA "✓ Check answer" — forest. Runs the grader (see **Typed‑answer grading** below), then flips to the back face with a result banner.

### 2c. Front face · LISTEN FIRST
Same card shell:
- Top row: `LISTEN & RECALL` · "🔊 Audio" chip (green).
- Center: large **120px circular play button** (forest `#1F4034`, brass play glyph, gold pulse), `TAP TO HEAR THE WORD`, and a row of two pills: "↺ Replay" and "🐢 Slow".
- CTA "⌄ Reveal answer" — forest.

### 3. Back face — Rich detail (all modes)
Scrollable card (`#FFFCF6`, radius 28, float shadow, padding 20/20/18). This is the **full card detail** minus mastery progress. Order:

- **(Type mode only) Result banner** — see **Typed‑answer grading**. Shown above everything.
- **Header row**: the English prompt (mono, truncated) · "🇩🇪 German" chip (bg `#EAF0EC`, text `#2E6B52`).
- **Article + gender** (nouns only): `der/die/das` badge (use `<lc-article-badge>`; prototype colors — der `#E9EFF7`/`#3B5C86`, die `#F5E9EC`/`#9B4A57`, das `#EFEADF`/`#74695A`) + gender word (masculine/feminine/neuter) + IPA phonetic (right, Spectral italic `#A89D8A`).
- **Headword** — Spectral 40px weight 600 `#211C16`; below: translation (15px `#5A5347`).
- **Plural row** (if any): inset chip `PLURAL` + plural form (Spectral 15px) + 34px audio button.
- **Listen to pronunciation** — full‑width dark button `#211C16`, text `#F4EFE4`, with a green "available" dot.
- Divider · `EXAMPLE SENTENCES` (mono label). Each example: left brass rule (`2px #E0CBA6`, 14px inset), German sentence (Spectral 16px) with the **headword bolded green** (`#2E6B52`), English translation below (13px italic `#8A7F6E`), and a 30px play button.
- **Usage note** — `#F6EFDF` card, 💡 + note text (12.5px `#6E6557`).
- Divider · `SYNONYMS` (mono label). Each synonym is an **expandable row**: optional article badge + word (Spectral 16px) + translation (right, truncated) + chevron (rotates 180° when open). Expanded panel (`#F4EFE4`): example sentence (synonym bolded green) + English + play button.

### 4. Rating footer (back face, all modes)
Pinned below the card, 16px side padding:
- Row: "‹ Previous" and "Skip ›" text buttons (`#A89D8A`).
- Label `HOW WELL DID YOU KNOW THIS?` (mono 9px).
- **Four rating buttons** (equal flex), each = label (Hanken 13px bold) + interval (mono 9.5px). SM‑2 intervals come from the card. Colors:
  - **Again** — bg `#F8E9EA`, border `#E7C3C8`, text `#9B4A57`.
  - **Hard** — bg `#F7F0DD`, border `#E5D5A6`, text `#8A6B26`.
  - **Good** — bg `#EAF0EC`, border `#C2D6C8`, text `#3E7A5E`.
  - **Easy** — solid forest `#1F4034`, text `#F4EFE4`.
- In **Type mode**, the **suggested** rating button gets a gold ring: `box-shadow: 0 0 0 2px #D8B981, 0 4px 12px -4px rgba(216,185,129,.6)`.
- Tapping a rating: records the grade, schedules via SM‑2, toasts "Scheduled · review in {interval}", advances. On the last card → **Session complete**.
- On the front face the footer shows a locked hint: "🔒 Rating unlocks after you reveal".

### 5. Session complete (Done)
Vertical scroll, 22px padding:
- **Celebration hero** — forest gradient card, centered: 64px brass check medallion, "Session complete" (Spectral 28px `#F4EFE4`), "{n} cards reviewed in {time}".
- **Two stat tiles**: **Recall rate %** (green) and **Day streak** (number + 🔥).
- **"How it went"** card — four bars (Easy/Good/Hard/Again) with counts; bar widths = share of session; colors Easy `#2E6B52`, Good `#5E9E7C`, Hard `#C99A3E`, Again `#B5582E`.
- **Cross‑feature bridge** — warm card "Lock it in with a story / See today's {n} tricky words in context" → Story Studio.
- **Actions**: primary "↻ Drill the {n} that need work" (forest), secondary "Back to Review home".

### 6. Mastery breakdown
Back chevron → hub. Header kicker `YOUR PROGRESS` + "Mastery".
- **Hero** — forest card: 92px brass ring with **overall mastery %** + "OVERALL MASTERY" + "{mastered} of {total} words are locked into long‑term memory."
- `WHERE YOUR WORDS STAND` — a **stacked bar** (4 segments, 14px tall, 2px gaps) then **legend rows**: color chip + label + sub + count + %. Lifecycle buckets & colors: **New** `#B0A593`, **Learning** `#C99A3E`, **Familiar** `#5E9E7C`, **Mastered** `#2E6B52`.
- **Struggling callout** — `#F8ECE6` card, ⚠ tile, "{n} words need attention / Repeatedly slipping — worth a focused pass", "Drill" button (`#B5582E`).
- `MASTERY BY COLLECTION` — per‑collection rows: name + "{mastered} / {total} · {pct}%" + progress bar (`linear-gradient(90deg,#2E6B52,#5E9E7C)`).

### 7. Session history
Header kicker `YOUR ACTIVITY` + "History".
- **Weekly chart card** — big weekly total (Spectral 24px) + "CARDS THIS WEEK"; streak pill "🔥 {n} day streak" (`#F6EFDF`). Below: **7 vertical bars** (M–S), heights normalized to the week max (min 6px); today's bar `#2E6B52`, active days `#A9C2B3`, empty days `rgba(33,28,22,.09)`; today's label green.
- **Sessions** grouped by `TODAY` / `YESTERDAY` / `EARLIER THIS WEEK`. Each row (`#FFFCF6` card): dot + title + time; then a stat line "**{cards}** cards · **{nailed}** nailed · **{struggled}** struggled" + duration (mono, right). Nailed green, struggled amber.

### 8. Custom study
Header kicker `BUILD A SESSION` + "Custom study". Scroll body + **sticky footer**.
- `INCLUDE CARDS` — multi‑select chips, each = label + pool count: **Due now** 142 · **New** 212 · **Struggling** 14 · **Learning** 188 · **Mastered** 123. Selected chip: forest bg `#1F4034`, text `#F4EFE4`; unselected `#FFFCF6` + border. (Pool counts come from shared selectors.)
- `SESSION LENGTH` — value (Spectral 20px green) "cards" + native range slider (min 5, max 50, step 5), `accent-color: #1F4034`.
- `ORDER` — segmented control (track `#EFE9DB`, selected segment `#FFFCF6` + shadow): **Due first** / **Hardest first** / **Shuffle**.
- `PROMPT DIRECTION` — segmented (mono labels): **EN → DE** / **DE → EN** / **Mixed**.
- **Sticky footer** (`#F4EFE4`, top border): primary "▶ Start {count}-card session" where `count = min(sum of selected pools, length)`. If no card type selected → toast "Pick at least one card type".

### 9. Leeches
Header kicker `STUBBORN WORDS` + "Leeches". Scroll body + sticky footer.
- **Explainer** — `#F6EFDF` card, 🐛 + "A **leech** is a card you've failed far more than you've recalled. They drain your sessions — tackle them head‑on, reset them, or rest them for a while."
- **Leech list** — each card (`#FFFCF6`, radius 18): article badge + word (Spectral 20px) + translation; right: "{n}×" (Spectral 22px `#B5582E`) + "FAILED". Below: lapse chip "Failed {x} of last {y}" (`#F7F0DD`/`#C99A3E`) + "Last seen {when}". Two actions: **Reset** (reset progress) and **Rest** (suspend/snooze).
- **Sticky footer**: "⚡ Break through all {n}" — accent button `#B5582E`, text `#FBF1EA`. Launches a focused session in **Type** mode.

---

## Interactions & Behavior

- **Navigation** is a single `screen` state machine: `hub | session | done | mastery | history | custom | leeches`. Sub‑screens use a back chevron → `hub`.
- **Study mode** (`flip | type | audio`) is chosen on the hub and persists; default **flip**. Any "start" entry point launches a session in the current mode. (Leeches' "Break through" forces `type`.)
- **Flip flow:** front → Reveal → back (rating footer enabled) → rate → next (or Done on last).
- **Type flow:** front → type (+ accent keys) → Check → grade → auto‑flip to back with result banner + suggested rating highlighted → rate → next.
- **Audio flow:** front (play/replay/slow) → Reveal → back → rate → next.
- **Skip / Previous:** Skip advances without scheduling; Previous goes back one card. Both reset typed state.
- **Toasts:** dark pill (`#211C16`, `#F4EFE4`), bottom‑center, auto‑dismiss ~1.7s. Used for scheduling confirmations, audio playback, leech actions, and unimplemented stubs.
- **Motion:** progress/stat bars animate width `.4s cubic-bezier(.4,0,.2,1)`; CTAs/play button use the 2.4s gold pulse; flashcard flip is 300ms (`t.$lc-duration-flip`). Synonym expand is a height/opacity reveal. **Avoid opacity‑based entrance animations that can leave content stuck** — the prototype removed them for reliability; use the codebase's standard transitions.

### Typed‑answer grading (strict article/gender)
Implement exactly:

1. Normalize input: trim, lowercase, collapse whitespace.
2. For **nouns** (`card.article` present): the full target is `"{article} {word}"`. Parse a leading `der|die|das` off the user input → `artUser` + `nounUser`; else `artUser = null`, `nounUser = input`.
3. Compare:
   - `nounExact = nounUser === word.toLowerCase()`
   - `nounClose = levenshtein(nounUser, word) <= 2 && word.length > 3`
   - `artOk = article ? (artUser === article) : true`
4. Verdict & suggested rating:
   - `nounExact && artOk` → **"Correct!"**, suggest **Good**.
   - `nounExact && noun‑article wrong/missing` → **"Mind the gender"**, suggest **Hard**, with note: `artUser ? "It's {article}, not {artUser}" : "Don't forget the article — it's {article}"`.
   - `nounClose` → **"So close"**, suggest **Hard**; if article also wrong, append note "Also: it's {article}".
   - else → **"Not quite"**, suggest **Again**.
5. **Result banner** (top of back face): tinted by outcome — correct `#E7F0EA` / close `#F6EFDF` / wrong `#F8ECE6` (matching borders). Shows a verdict medallion (✓ / ≈ / ✕ in the verdict color), the verdict text, a "SUGGESTED ↓" hint, `YOU WROTE` and the typed answer rendered **per‑character**: each char green `#2E6B52` if it matches the full target at that index, else red `#B5582E`. If a gender note exists, show it (ⓘ, `#8A6B26`).
6. Verbs / article‑less words: grade on the word alone (no article required).

---

## State Management

Prototype‑local state (map to the app's `ReviewStore` / session signals — **do not** re‑derive shared counts):

- `screen` — current view.
- `mode` — `flip | type | audio`.
- `idx`, `flipped`, `expanded[]` (open synonym indices).
- `tally` `{again,hard,good,easy}`, `startMs`, `reviewedWords[]` — for the Done summary.
- `typed`, `typedResult` `{verdict, correct, close, suggested, genderNote, youChars[]}`.
- `custom` `{scope, types[], length, order, dir}`.

**From shared app state** (see `reference/epic-review-system-reconciliation.md`): due/new/overdue/struggling/mastered counts, `lifecycleState`, mastery distribution, weekly buckets + streak, session history, and SM‑2 scheduling (`Sm2Service.compute`). Counts shown in the prototype (142 due, 86 new, 665 total, etc.) are **sample data** — bind to real selectors.

---

## Design Tokens

> Values used by the prototype. Fold into `_tokens.scss` (+ `_dark.scss`). Where an LDS token already exists (article gender, mastery, radius, spacing), extend/retune it rather than adding a parallel token.

**Typography (NEW — confirm before adopting):**
- Display serif: **Spectral** — weights 300/400/500/600 (+ italics). Used 15–40px.
- Body sans: **Hanken Grotesk** — 400/500/600/700/800.
- Mono (labels/meta): **Spline Sans Mono** — 500/600. Always uppercase + letter‑spacing 1–3px for kickers.
- Approx scale (px): mono labels 8–10 · body 11–15 · serif headings 16–40 · hero numerals 24–34.

**Core palette:**
- Surfaces: base `#F4EFE4` · card `#FFFCF6` · card‑alt `#FBF7EF` · inset `#EFE9DB` / `#F4EFE4`.
- Borders: `rgba(33,28,22,.08)` · strong `rgba(33,28,22,.12)`.
- Text: primary `#211C16` · secondary `#5A5347` · muted `#8A7F6E` · hint `#9A8F7C` / `#A89D8A` / `#B0A593` / `#C2B7A2`.
- Brand forest: dark gradient `#1F4034 → #15281F` · mid `#2E6B52` · greens `#5E9E7C` / `#A9C2B3` · on‑dark text `#F4EFE4` / `#16281F`.
- Accent brass/gold: `#D8B981` (on dark) · `#8A6636` (mono on light) · `#E0A35C`.
- Amber/warn: `#C99A3E` · text `#8A6B26` · bg `#F7F0DD` · border `#E5D5A6`.
- Struggle/error: `#B5582E` / `#9B4A57` · bgs `#F8ECE6` / `#F8E9EA` / `#F5E5E0` · success bgs `#E7F0EA` / `#EAF0EC`.
- Leech dark gradient: `#2A1B14 → #3A2417`.
- Article gender → **use `<lc-article-badge>`**: der `#E9EFF7`/`#3B5C86` · die `#F5E9EC`/`#9B4A57` · das `#EFEADF`/`#74695A` · verb/none `#ECE7DB`/`#8A7F6E`.
- Mastery lifecycle: New `#B0A593` · Learning `#C99A3E` · Familiar `#5E9E7C` · Mastered `#2E6B52` (map onto `t.$lc-mastery-0…5`).

**Radius:** chips/badges 7–13px · cards 15–20px (`t.$lc-radius-md/lg`) · flashcard 28px (`t.$lc-radius-xl`) · pills/dots `full`.

**Shadows:** card `0 8px 22px -16px rgba(33,28,22,.5)` (`t.$lc-shadow-card`) · float/flashcard `0 24px 50px -28px rgba(33,28,22,.7), 0 2px 6px rgba(0,0,0,.05)` (`t.$lc-shadow-float`) · hero forest `0 22px 44px -22px rgba(20,30,24,.85)` · primary‑button `0 12px 26px -12px rgba(20,30,24,.7)`.

**Spacing rhythm:** 4 · 8 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 28 px (map to `t.$lc-space-*`).

**Motion:** fast 150ms · base 250ms · flip 300ms (`t.$lc-duration-flip`) · bar fills `.4s cubic-bezier(.4,0,.2,1)` · gold CTA pulse 2.4s.

---

## Assets

- **Icons** — all inline SVG, 1.7–2.2px stroke, rounded caps (feather/lucide style). Replace with the app's existing icon set (match weight). Notable custom ones: bar‑chart (mastery), leech "bug", lightning bolt (break through), waveform/speaker (audio).
- **Fonts** — Spectral, Hanken Grotesk, Spline Sans Mono (Google Fonts in the prototype; bundle locally for the app).
- **Flags** — 🇬🇧 / 🇩🇪 emoji as language chips; swap for the app's flag assets if it has them.
- **No raster images** — everything is type, color, and vector.

---

## Files

- `Review.dc.html` — the complete prototype (all 9 screens + 3 modes + grading logic). Open it in a browser (with `support.js` beside it) to interact with every flow. **Read the `<script data-dc-script>` block** for the exact grading algorithm, sample data, and state transitions.
- `support.js` — prototype runtime (lets `Review.dc.html` render). **Not for production.**
- `reference/lds-skill.md` — the LinguaCard Design System rules + token names + shared component catalogue. **The styling contract.**
- `reference/epic-review-system-reconciliation.md` — canonical SRS/mastery definitions (new/due/mastered/struggling, SM‑2, session stats, streak/weekly bucketing). **The logic contract.**
- `reference/epic-review-rich-back-face.md` — spec for the rich back‑face content (plural, examples, synonyms).
- `CLAUDE_CODE_PROMPT.md` — paste‑ready prompt to drive the implementation.

## How to view the prototype
Open `Review.dc.html` in a modern browser (keep `support.js` next to it). Use the on‑screen controls to walk every flow: switch study modes on the hub, start a session, try the typed‑answer grader (e.g. type `Zustand` vs `der Zustand`), open Mastery / History / Custom / Leeches.
