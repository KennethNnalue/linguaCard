# Handoff: Story Studio 2.0 (LinguaCard German learning app)

## Overview
A full redesign of LinguaCard's **Story** feature: a story discovery home, an immersive reader with tap-on-word lookup, a playlist-style audio player with karaoke highlighting, a fill-in-the-blank quiz, keyword & grammar references, and a story-completion screen. The redesign targets four problems with the old UI: a cluttered home, no clear separation between platform "Explore" stories and the user's own "My Stories", confusing filtering, and an overloaded reader. Target platform is the existing **Capacitor + Ionic + Angular** mobile app (see `linguaCard/apps/mobile`). Design width ≈ 390px (iPhone).

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, layout, and behavior. They are **not production code to copy directly**. The task is to **recreate these designs inside the existing LinguaCard codebase** (Angular standalone components + Ionic, the patterns already used under `apps/mobile/src/app/features/stories`), reusing its routing, state services, audio layer, and API. Treat the HTML/JS as the source of truth for *appearance and interaction*, and the codebase as the source of truth for *architecture*.

- `Story Studio.dc.html` — the editable source (a single component: template markup + a JS logic class holding all state/data). Easiest to read for logic and exact markup.
- `Story Studio.html` — a self-contained, offline build of the same prototype. Open in any browser to click through every flow.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interaction details are intentional and should be reproduced pixel-accurately using LinguaCard's existing components where equivalents exist (Ionic toolbars, etc.) and custom markup where they don't. All hex values, sizes and copy below are exact.

---

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Pine (primary) | `#23463B` | primary buttons, active tabs, mini-player, word sheet bg accents |
| Pine deep | `#16302A` | quiz panel bg, expanded player bg |
| Pine darkest | `#15211C` | phone frame border, scrims base |
| Ink | `#1C2622` | primary text, dark sheet bg |
| Sage (accent) | `#4E8C76` | progress fill, eyebrow labels, secondary accents |
| Sage light text | `#356151` | vocab words in reader |
| Mint (audio/quiz accent) | `#6EE7B7` | player progress, karaoke/correct states, repeat/shuffle active |
| Karaoke highlight bg | `#CFE3D9` | current spoken word background |
| Karaoke read text | `#8FB0A4` / `#AAB2AC` | already-read vocab / plain words |
| Paper (app bg) | `#F4F1E9` | screen background |
| Paper warm gradient | `#EFEADC → #E2DBCB → #D8D0BD` | outer body radial bg |
| Card white | `#FFFFFF` | cards, list rows |
| Panel sand | `#ECE7DA` | segmented-control track |
| Mint chip bg | `#E6EFEA` / border `#BFD8CC` / text `#2F6B58` | active category chip, "English" toggle on |
| Muted text | `#9AA39E` / `#8A938E` | meta text |
| Hairline | `rgba(28,38,34,.08–.12)` | dividers, card borders |
| Article der | bg `#E9F1FA` text `#2E6FB0` border `#BBD4EE` | der-noun pills |
| Article die | bg `#FBECEF` text `#C0506A` border `#EEC2CC` | die-noun pills |
| Article das | bg `#F1EDE4` text `#7A7468` border `#D8D2C4` | das-noun pills |
| Verb tag | bg `#F3E7DC` text `#A85C2E` | verb type tag (keywords) |
| Premium star | `#F2C57C` | premium story star |
| Cover gradients | `linear-gradient(140deg,#2E5547,#6E9C88)`, `(140deg,#36544C,#86A99A)`, `(145deg,#7C4A2E,#C2703D)`, `(140deg,#22403A,#4E8C76)`, `(140deg,#566A4E,#9DB08C)`, `(145deg,#3E4F6B,#7D8FA8)` | story covers g1–g6 |

### Typography
- **Display / serif:** `Newsreader` (Google Fonts), weights 400/500/600, optical sizing on. Used for all story titles, story body text, big numbers. Sizes: screen title 32px/500; section headers 20px/500; card titles 14.5–18px/500; reader body **19px/1.62**; hero numbers 24–44px.
- **UI / sans:** `DM Sans` (Google Fonts), 400/500/600/700. Eyebrows 9–11px/700 letter-spacing 2–2.5px uppercase; body/meta 10.5–13px; buttons 12–14px/600.

### Spacing / radius / shadow
- Screen padding: 18px horizontal. Card gaps 11–14px.
- Radii: cards 16–24px; pills/chips 18–26px; sheets 26px top corners; phone frame 50px.
- Card shadow: `0 6px 18px -10px rgba(22,48,42,.28), 0 1px 3px rgba(0,0,0,.04)`.
- Sheet shadow: `0 -12px 40px rgba(0,0,0,.35–.4)`.
- Floating pill shadow: `0 12px 32px -8px rgba(22,48,42,.55)`.

### Keyframes
- `sheetUp`: translateY(100%) → 0, `.26–.28s cubic-bezier(.2,.8,.2,1)`.
- `fadeIn`: opacity 0→1, `.18s`.
- `toastIn`: opacity 0 + translateY(8px) → 0, `.22s`.

---

## Screens / Views

### 1. Home — Story Studio
**Purpose:** discover and resume stories. Bottom tab "Stories".
**Layout (top→bottom, 18px gutters):**
- **Header row:** eyebrow `LINGUACARD` (10px/700, sage, ls 2.5px) above `Stories` title (Newsreader 32px/500, ink). Right: 40px circle search button (white, hairline border, magnifier icon) + 40px circle "+" button (pine bg, white icon, shadow `0 6px 16px rgba(35,70,59,.3)`).
- **Continue-reading hero card** (radius 24px, white, shadow): left 104px color block (cover gradient g1) with a level pill top-left (`B1`, 10px/700 on `rgba(21,33,28,.55)` blur). Right: eyebrow `CONTINUE READING` (sage), title (Newsreader 18px), meta `4 min read · Travel` (11px muted), then a 5px progress track (`#EAE5D8`) with sage fill at **38%** and `38%` label. Tapping opens the reader on that story.
- **"Explore" section header** (Newsreader 20px) + subtitle "Curated by LinguaCard"; right-aligned **See all ›** text button (sage 12px/600).
- **Level segmented control:** track `#ECE7DA`, radius 22px, 4px pad. 5 segments `All A1 A2 B1 B2`. Active = white pill, ink text, shadow `0 2px 6px rgba(22,48,42,.12)`; inactive text `#8A938E`. Single-select.
- **Category chips** (horizontal scroll): `All Travel Daily Life Food Work Fiction`. Active = mint chip (`#E6EFEA`/border `#BFD8CC`/text `#2F6B58`); inactive = white, hairline border, text `#7E877F`. Toggling an active chip returns to `All`.
- **Explore rail:** horizontal scroll of 170px cover cards (radius 18px): 114px gradient header with level pill + optional premium star (top-right); body has title (Newsreader 15px, min-height 38px for 2 lines) and meta `4 min · Travel`. Filtered live by level + category.
- Divider hairline.
- **"My Stories" section header** (Newsreader 20px) + subtitle "Made by you"; right: `3 saved` count.
- **My Stories list** (vertical): row card (white, radius 18px, 12px pad) = 48px rounded-square gradient tile with serif initial letter, then title (Newsreader 15.5px) + meta `2 min · 68 words · A1`, then a row of article-colored vocab chips (e.g. `die Serviette`, `hoffentlich`) and a `+65 more` muted label; trailing 40px circle play button (`#EAF1ED` bg, pine icon). Whole row and play button both open the reader.

**See-all state:** replaces the rail with a 2-column grid of the same cover cards (filtered), hides My Stories, and shows a "Back to Stories" outline button.

### 2. Reader
**Purpose:** read a story with audio + tap-to-look-up.
**Cover header (152px):** full-bleed story gradient with a bottom darkening overlay. Top-left 34px circle back button (`rgba(21,33,28,.32)` blur). Top-right "Mark as learned" pill (checkmark + text; bg `rgba(21,33,28,.32)`, or mint-tinted `rgba(110,231,183,.3)` when on, white border). Bottom: level pill, then story title (Newsreader 24px white) and meta `Travel · 4:00`.
**Tabs:** segmented control (track `#ECE7DA`): `Story | Quiz | Keywords | Grammar`. Active tab = **pine fill, white text**.

**Story tab:**
- Row: hint "Tap any word to look it up" (11px muted) + right **English** toggle (globe icon; on = mint chip, off = white/hairline). Toggling shows/hides the per-sentence English translation.
- Sentences: each sentence is Newsreader 19px/1.62 ink. Words are individually tappable spans. **Vocab words** (those with a dictionary entry) are sage `#356151`/500 with a dotted underline `#93BAAB`. A tapped word shows pine bg + white text. Below each sentence, when English is on, an italic translation in `#7C9A8E` 13px.
- **Karaoke:** while audio plays, the currently-spoken word gets bg `#CFE3D9`, text `#15302A`, 600 weight, slightly larger pad; already-read words soften (vocab → `#8FB0A4`, plain → `#AAB2AC`). Highlight advances word-by-word through the whole story (flattened across sentences).
- Bottom of text: a white "Finished reading?" card with a pine **"Mark story complete"** button. (Completion is always user-initiated — see Interactions.)

**Quiz tab:** dark panel `#16302A`, radius 22px, min-height 520px.
- Active question: top bar `#1F3D34` with a 60px circular progress ring (track `rgba(255,255,255,.18)`, mint stroke, `r=31`, dasharray 194.8, offset by progress) showing `1/5` center; a speaker button right.
- Body: the sentence with a blank, e.g. `Nachtzüge helfen Menschen, in der Nacht zu ___.` rendered Newsreader 20px white centered; the blank is an underline that fills with the chosen answer.
- 3 answer buttons (radius 15px). Default: translucent white. After answering: correct = mint-tinted (`rgba(110,231,183,.26)` + `#6EE7B7` border), chosen-wrong = red-tinted (`rgba(244,150,150,.24)` + `#F49696`), others dimmed.
- On wrong answer a **HINT** card appears (mint label + explanation). A pine **Next question / Finish quiz** button appears once answered.
- Footer: "Pause on mistakes" label + a mint toggle (shown ON).
- Complete state: centered emoji (🎉/👍/💪 by score), big `4 / 5` (Newsreader 44px), "correct answers", and a sage **"Take it again"** button.

**Keywords tab:** vertical list of white rows (radius 16px): German headword (Newsreader 16px) + English gloss (12px muted), a type tag (`Noun` mint / `Verb` sand), and a chevron. Tapping a row opens that word's bottom sheet.

**Grammar tab:** white cards (radius 16px) with a 3px sage left border: bold serif title + 13px explanation. (3 cards: separable verbs, dative after "in", plural of der-nouns.)

### 3. Word bottom sheet (overlay)
Dark sheet (`#1C2622`, radius 26px top), scrim `rgba(21,33,28,.4)`, `sheetUp` animation. Grab handle. Left: headword (Newsreader 27px white); for **nouns** the plural line + a mint `PLURAL` tag; English gloss; for **verbs** a `VERB` tag. Right: a 42px circle speaker (play pronunciation) and a 42px circle add-to-vault button (becomes pine + checkmark once added; shows toast "Added to your vault" / "Already in your vault"). For verbs, a **Conjugate** toggle expands a 3-column table: pronoun | **PRÄSENS** | **PRÄTERITUM** (6 rows ich/du/er-sie/wir/ihr/sie-Sie), plus a `Perfekt:` and `Imperativ:` line. Tapping another word swaps the sheet content; tapping the scrim closes it.

### 4. Mini player (reader, story tab)
Pinned bar 16px from sides, 84px from bottom: pine bg, radius 22px, a mint progress fill along the bottom (3px). Controls: prev (skip to story start if >5 words in, else previous track), 40px white **play/pause**, the title + `0:00 / 4:00` time (tapping expands), next, and an expand chevron.

### 5. Expanded player + queue (overlay)
Full sheet (`#16302A`, radius 26px top, scrim, `sheetUp`). `NOW PLAYING` label + collapse chevron. 128px cover (story gradient) with level pill. Centered title (Newsreader 22px) + meta. Mint progress bar + `current / total` times. Transport row: **shuffle**, prev, 64px white **play/pause**, next, **repeat**. Shuffle & repeat active states use mint tint; repeat-one shows a mint "1" badge. A caption shows the current repeat mode ("Repeat off / Repeat queue / Repeat this story"). A sage **"Mark story complete"** button + caption "Stories never finish on their own — tap when you're ready." Then an **UP NEXT** list: rows with a play-triangle (current) or index number, title, and `B1 · 4 min`; tapping a row plays that story.

### 6. Story Complete screen
Centered: 118px rounded-square cover gradient with a big white checkmark; eyebrow `STORY COMPLETE` (sage); title (Newsreader 26px) + meta; if the quiz was completed, a white card showing `QUIZ SCORE` `4 / 5`; a pine **"Replay story"** button (restarts playback from the top), a mint **"Play next · <title>"** button, and a muted **"Back to Stories"** text button.

### 7. Bottom navigation (persistent)
5 items: Home, Vault, Review, Stories, Progress. Active = pine; inactive = `#AEB5AF`. White blurred bar, 72px, top hairline. (This is the existing app shell — wire to real routes.)

---

## Interactions & Behavior

### Audio player / playlist (key requirement)
- The reader runs off a **queue** (prototype default `['p1','p6','p2','p4']`). Opening a story sets the queue index to that story.
- **Play/pause** drives a karaoke timer (prototype: advances one word every ~360ms; **in production sync to real audio word-timestamps**, which LinguaCard already generates).
- **Autoplay:** when a story's audio reaches the end, it automatically loads and plays the **next** story in the queue. With **repeat-queue** it loops from the end back to the first; with **repeat-one** it restarts the same story; with **repeat-off** at the end of the last track it stops and parks on the final word (does NOT navigate away).
- **Shuffle:** next/auto-advance picks a random different queue index.
- **Repeat** cycles: off → repeat queue → repeat this story.
- **Prev:** if more than 5 words into a story, restart it; otherwise go to the previous queue item (wraps under repeat-queue).
- **Manual completion only:** finishing audio NEVER routes to the Story Complete screen. The user reaches completion exclusively via "Mark story complete" (mini/expanded player or end-of-text card). This is what makes "Replay story" meaningful.

### Tap-on-word
Tapping a vocab word opens/swaps the word sheet (toggle off if tapping the same word). Tapping plain words or the scrim closes it. Add-to-vault is idempotent with a toast.

### Filtering (home)
Level is single-select (`all` default). Category toggles (re-tapping active → `all`). Explore list is filtered by both, live. See-all swaps rail→grid and hides My Stories.

### Quiz
One question at a time; selecting an answer locks the row, scores it, reveals correct/wrong coloring, shows a hint on wrong, then Next. After the last question shows the score summary; "Take it again" resets index/score.

### Misc
Toasts auto-dismiss after ~1.7s. "Mark as learned" is a visual toggle on the cover. English-translation toggle persists within the reader session.

## State Management
Per the prototype's single logic class — map these onto Angular signals/services:
- `screen` (`home | reader | complete`), `tab` (`story | quiz | keywords | grammar`), `seeAll`.
- `level`, `cat` (home filters).
- `currentId`, `queueIdx`, `QUEUE[]`, `karaokeIdx` (-1 = not started), `playing`, `ended`, `repeatMode` (`off|all|one`), `shuffle`, `playerExpanded`.
- `wordId`, `showConj` (word sheet); `vault{}` (added words).
- `translate`, `learned` (reader).
- `quizIdx`, `quizChosen`, `quizScore`.
- `toast`.
Data shapes in the prototype: `PLATFORM[]` (explore stories), `MINE[]` (user stories), `STORIES{}` (id → sentences → tokens `[text, wordId?, isVocab?]`), `WORDS{}` (dictionary incl. noun article/plural and verb conjugation tables), `QUIZ[]`, `GRAMMAR[]`. Replace all with real API/services.

## Assets
- **Fonts:** Newsreader + DM Sans from Google Fonts (already inlined in the standalone build).
- **Icons:** inline SVG (stroke-based), no icon font. Match to the app's existing icon set (Ionicons) where possible.
- **Imagery:** story covers are CSS gradients as placeholders. **Replace with real cover art** from the content system; keep the gradient as a fallback/skeleton.
- No raster image assets are required by the design itself.

## Screenshots
Reference renders of every screen/state are in `screenshots/` (open `Story Studio.html` for the live, interactive version):

| File | Screen / state |
|---|---|
| `01-home.png` | Home — hero, Explore filters, rail |
| `02-home-see-all.png` | Home — "See all" 2-column grid |
| `03-reader-story.png` | Reader — Story tab + mini player |
| `04-reader-karaoke.png` | Reader — karaoke word highlighting while playing |
| `05-word-sheet-noun.png` | Tap-on-word sheet — noun (article + plural + add to vault) |
| `06-word-sheet-verb-conjugation.png` | Word sheet — verb with expanded conjugation table |
| `07-quiz-question.png` | Quiz — unanswered question with progress ring |
| `08-quiz-answered-hint.png` | Quiz — wrong answer state with hint |
| `09-keywords.png` | Reader — Keywords tab |
| `10-grammar.png` | Reader — Grammar tab |
| `11-expanded-player-queue.png` | Expanded player — transport, repeat/shuffle, Up Next queue, Mark complete |
| `12-story-complete.png` | Story Complete screen |

## Files
- `Story Studio.dc.html` — design source (markup + logic + all sample data). Read this for exact values and behavior.
- `Story Studio.html` — standalone, click-through build (open in a browser).
- Existing code to integrate with: `linguaCard/apps/mobile/src/app/features/stories/` (pages: `story-library`, `story-reader`; components: `generate-story-sheet`, `quiz-tab`).
