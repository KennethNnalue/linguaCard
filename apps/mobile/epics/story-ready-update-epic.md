# Story Reader — Epic Redesign: User Stories
## Story/Quiz/Keywords/Grammar Tab Navigation

**Context:** The existing story reader (`/stories/:id`) uses a two-button toggle ("🇩🇪 German" / "🇬🇧 Translation"). We are extending it to a four-tab navigation system — **Story · Quiz · Keywords · Grammar** — matching the design shown in the reference screenshots (app: likely Chatterbug/Lingopie style). The tab bar sits below a story cover/header image, and the audio player remains persistent at the bottom. All content (quiz questions, keywords, grammar notes) is **AI-generated** at story creation time and stored on the `Story` entity.

---

## Current State Summary

| Area | What exists today |
|---|---|
| `Story` entity / model | `bodyDe`, `bodyEn`, `sentences[]`, `wordTimestamps[]`, `vocabWords[]` — **no** `quizQuestions`, `grammarNotes` fields |
| `StoryReaderPage` | Two-tab toggle (German / Translation), karaoke player, audio controls |
| `StoryGenerationService` | Generates story text + audio. **No** quiz, keywords, or grammar generation |
| `StoryPromptBuilder` | Story-text prompt only |
| `Story` shared domain type | `libs/shared/domain/src/index.ts` — needs new fields |

---

## Epic Breakdown

### Phase 1 — Data model & backend generation (unblocks everything)
- **LC-R01** — Extend `Story` domain type with quiz, grammar, keyword fields
- **LC-R02** — Backend: generate quiz questions during story creation
- **LC-R03** — Backend: generate grammar notes during story creation
- **LC-R04** — Backend: extract/enrich keyword list during story creation

### Phase 2 — Frontend: Reader shell redesign
- **LC-R05** — Replace two-tab toggle with four-tab Story/Quiz/Keywords/Grammar nav
- **LC-R06** — Story tab: redesign header area (cover image, title, meta row)
- **LC-R07** — Story tab: translation toggle as inline button (not a tab)

### Phase 3 — New tabs
- **LC-R08** — Quiz tab: fill-in-the-blank question UI with audio
- **LC-R09** — Quiz tab: answer feedback (correct/wrong states) and progress counter
- **LC-R10** — Keywords tab: vocabulary list with level badge, word type, play button
- **LC-R11** — Grammar tab: expandable grammar rule cards

### Phase 4 — Polish & persistence
- **LC-R12** — Persist quiz progress (answered questions survive tab switching)
- **LC-R13** — "Mark as learned" header action

---

## Detailed User Stories

---

### LC-R01 · Extend Story domain type — quiz, grammar, keywords

**Epic:** Story Reader Redesign  
**Phase:** 1 — Data model  
**Points:** 2  
**Depends on:** nothing (do first)

#### User story
As a developer, I want the `Story` domain type to include `quizQuestions`, `grammarNotes`, and a richer `keywords` array, so that all new reader tabs have a stable data contract before any UI is built.

#### Files to modify

| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Add `StoryQuizQuestion`, `StoryGrammarNote`, `StoryKeyword` interfaces + extend `Story` |
| `apps/api/src/stories/story.entity.ts` | Add `quizQuestions`, `grammarNotes` JSON columns (keywords already covered by `vocabWords`) |

#### New types to add to `libs/shared/domain/src/index.ts`

```typescript
export interface StoryQuizQuestion {
  id: string;                    // uuid, for tracking which were answered
  sentenceTemplate: string;      // "Man kann auch unter ___ Sternenhimmel schlafen."
  correctAnswer: string;         // "dem"
  distractors: string[];         // ["das", "den"]  (always 2 distractors → 3 choices total)
  audioSentence?: string;        // optional: the full sentence read aloud (for the 🔊 icon)
  hint?: string;                 // optional grammar hint shown after wrong answer
}

export interface StoryGrammarNote {
  id: string;
  title: string;                 // "Modal verb \"können\""
  exampleDe: string;             // "Man kann auch unter dem Sternenhimmel schlafen."
  exampleEn: string;             // "You can also sleep under the stars."
  description: string;           // Multi-paragraph markdown-style plain text
  additionalExamples: Array<{    // shown as example cards below description
    de: string;
    en: string;
  }>;
}

export interface StoryKeyword {
  cardId: string | null;         // null if not in user's vault
  german: string;                // "der Sternenhimmel"
  germanBase: string;            // "Sternenhimmel"
  english: string;               // "starry sky"
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}
```

#### Extend `Story` interface

```typescript
export interface Story {
  // ... existing fields unchanged ...
  quizQuestions: StoryQuizQuestion[];    // NEW — AI-generated fill-in-the-blank
  grammarNotes: StoryGrammarNote[];      // NEW — AI-generated grammar explanations
  keywords: StoryKeyword[];             // NEW — replaces/extends vocabWords for Keywords tab
}
```

#### Acceptance criteria
- [ ] All three new interfaces exported from `libs/shared/domain/src/index.ts`
- [ ] `Story` interface updated with the three new optional fields (use `?` initially to avoid breaking existing seeds)
- [ ] `StoryEntity` has `quizQuestions` and `grammarNotes` as nullable JSON columns (keywords derived from existing `vocabWords` + new `keywords` column)
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`
- [ ] Existing story seeds in `db.json` still parse without error (new fields absent = empty arrays via nullish coalescing)

---

### LC-R02 · Backend: AI-generate quiz questions at story creation

**Epic:** Story Reader Redesign  
**Phase:** 1 — Backend generation  
**Points:** 5  
**Depends on:** LC-R01

#### User story
As a language learner, I want quiz questions to be automatically generated when a story is created, so that when I open the Quiz tab I can immediately test my understanding of the story's grammar.

#### How quiz questions work (from screenshots)
- Format: fill-in-the-blank — a sentence from the story with one word replaced by `___`
- The blank is always a **grammatically interesting** word (article case, verb conjugation, preposition)
- 3 answer choices (1 correct + 2 plausible distractors)
- There is an audio icon — tapping it reads the full sentence aloud
- Progress shown as `1/4`, `2/4`, etc.

#### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-prompt.builder.ts` | Add `buildQuizPrompt(sentences, vocabWords)` method |
| `apps/api/src/stories/story-generation.service.ts` | Call quiz generation after story text; attach to entity |
| `apps/api/src/stories/story.entity.ts` | Persist `quizQuestions` JSON column |

#### Prompt design
```
Given this German story (as sentence pairs), generate 3-5 fill-in-the-blank quiz questions 
that test understanding of grammar patterns used in the story.

RULES:
1. The blank must replace a single word that demonstrates a grammar rule (article case, 
   modal verb form, preposition, adjective ending)
2. The correct answer must come from the actual story sentence
3. Generate exactly 2 distractors that are plausible but grammatically wrong
4. Distractors should differ only in the grammatical dimension being tested 
   (e.g. "dem"/"den"/"das" tests dative vs accusative, not random words)
5. Include a short hint (1 sentence) explaining the grammar rule after wrong answers

OUTPUT: JSON array of StoryQuizQuestion objects
```

#### Acceptance criteria
- [ ] `StoryPromptBuilder.buildQuizPrompt()` produces a valid prompt for the Claude API
- [ ] Quiz generation is called inside `StoryGenerationService.generateAndSave()` after story text is ready
- [ ] 3–5 quiz questions generated per story (configurable, default 4)
- [ ] Each question has exactly 3 answer options (1 correct, 2 distractors)
- [ ] Questions are stored in `story.quizQuestions` as a JSON column
- [ ] If quiz generation fails (API error), story is still saved — `quizQuestions` defaults to `[]`
- [ ] Manual QA: questions target grammatically interesting words, not random nouns
- [ ] Distractors for articles are always other German articles (`der/die/das/dem/den/des`)

#### Implementation note — quiz generation call
```typescript
// story-generation.service.ts — inside generateAndSave()
let quizQuestions: StoryQuizQuestion[] = [];
try {
  quizQuestions = await this.generateQuizQuestions(content.sentences, cards);
} catch (err) {
  this.logger.warn('Quiz generation failed, story saved without quiz', err);
}
```

---

### LC-R03 · Backend: AI-generate grammar notes at story creation

**Epic:** Story Reader Redesign  
**Phase:** 1 — Backend generation  
**Points:** 4  
**Depends on:** LC-R01

#### User story
As a language learner, I want grammar explanations to be automatically generated for each story, so that when I open the Grammar tab I can understand the grammatical patterns used in that specific story.

#### How grammar notes work (from screenshots)
- Each note has: a title (e.g. "Modal verb "können""), an example sentence from the story (bold keyword highlighted), a Description section with plain-text explanation, optional conjugation/declension table, additional example sentences at the bottom
- Multiple notes per story (one per grammar topic found)

#### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-prompt.builder.ts` | Add `buildGrammarPrompt(sentences, difficulty)` |
| `apps/api/src/stories/story-generation.service.ts` | Call grammar generation; attach to entity |

#### Prompt design
```
Analyse this German story and identify 2-3 grammar topics that a learner at {difficulty} level 
should understand. For each topic:
1. Write a clear title
2. Pick the best example sentence FROM THE STORY
3. Write a 2-3 paragraph description in plain English (no jargon without explanation)
4. If it's a verb: include a present-tense conjugation table
5. If it's an article/declension: include a small usage table
6. Provide 2 additional example sentences (German + English) different from the story

Focus on grammar that is ACTUALLY USED in the story, not generic explanations.
OUTPUT: JSON array of StoryGrammarNote objects
```

#### Acceptance criteria
- [ ] 2–3 grammar notes generated per story
- [ ] Each note references an actual sentence from the story as its example
- [ ] `additionalExamples` contains exactly 2 examples (de + en pairs)
- [ ] Grammar generation is non-blocking — story saves even if grammar generation fails
- [ ] Notes stored in `story.grammarNotes` JSON column
- [ ] A1/A2 stories get grammar notes about: articles, basic verbs, simple sentence structure
- [ ] B1/B2 stories get grammar notes about: modal verbs, subordinate clauses, passive voice

---

### LC-R04 · Backend: extract structured keywords at story creation

**Epic:** Story Reader Redesign  
**Phase:** 1 — Backend generation  
**Points:** 3  
**Depends on:** LC-R01

#### User story
As a language learner, I want the Keywords tab to show a rich, level-tagged vocabulary list for each story, so that I can see all important words with their type, difficulty level, and translation.

#### How keywords work (from screenshots)
- Each keyword card shows: level badge (A1, A2, B1, B2 — coloured pill), word in bold with type label (`- verb`, `- noun`, `- adjective`), English translation below, dumbbell icon (add to training), play icon (audio)
- There is a "Memorize keywords" CTA button at the top of the list
- Keywords include words at mixed CEFR levels — not just the story's overall level

#### Files to modify

| File | Change |
|---|---|
| `apps/api/src/stories/story-generation.service.ts` | Build `keywords` array from `cards` + enrich with level/wordType via AI |
| `libs/shared/domain/src/index.ts` | `StoryKeyword` type (already added in LC-R01) |
| `apps/api/src/stories/story.entity.ts` | `keywords` JSON column |

#### Logic
- **Source:** Start from the `vocabWords` already extracted from the user's card vault
- **Enrichment:** For nouns/verbs not in the vault, optionally call AI to classify level and word type  
- **Ordering:** Sort by CEFR level ascending (A1 → C2), then alphabetically within level
- **"Add to training" button:** This maps to `cardId` — if the word is in the vault, show it; otherwise show an "add" action

#### Acceptance criteria
- [ ] Every story has a `keywords` array populated at generation time
- [ ] Each keyword has: `german`, `germanBase`, `english`, `article`, `wordType`, `level`, `cardId`
- [ ] Keywords sorted A1 → C2 by level
- [ ] For nouns: `article` is correctly set (`der`/`die`/`das`)
- [ ] At least the vocabulary words from the user's vault appear as keywords
- [ ] `wordType` is one of: `'noun' | 'verb' | 'adjective' | 'adverb' | 'other'`

---

### LC-R05 · Frontend: Replace two-tab toggle with four-tab nav

**Epic:** Story Reader Redesign  
**Phase:** 2 — Reader shell  
**Points:** 3  
**Depends on:** LC-R01

#### User story
As a language learner, I want to navigate between Story, Quiz, Keywords, and Grammar sections using a tab bar below the story header, so that all content is one tap away and I always know where I am.

#### Design reference (from screenshots)
```
[ Story ]  [ Quiz ]  [ Keywords ]  [ Grammar ]
  ↑ active tab has brand-green pill background + white text
  inactive tabs are plain text, no background
```

The tab bar sits **below** the hero image/header area and **above** the content area. The audio player bar stays pinned at the bottom (Story tab only — hidden on other tabs).

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | Replace `sr-tab-bar` with four-tab `sr-section-tabs` |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | Replace `showTranslation: signal<boolean>` with `activeTab: signal<'story' \| 'quiz' \| 'keywords' \| 'grammar'>` |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | Style the new tab bar to match screenshots |

#### Component state change
```typescript
// BEFORE
readonly showTranslation = signal(false);

// AFTER
readonly activeTab = signal<'story' | 'quiz' | 'keywords' | 'grammar'>('story');
readonly showTranslation = signal(false); // remains — controls translation within Story tab
```

#### HTML structure
```html
<!-- Four-tab section navigation -->
<div class="sr-section-tabs">
  <button class="sr-section-tab" [class.active]="activeTab() === 'story'" (click)="activeTab.set('story')">Story</button>
  <button class="sr-section-tab" [class.active]="activeTab() === 'quiz'" (click)="activeTab.set('quiz')">Quiz</button>
  <button class="sr-section-tab" [class.active]="activeTab() === 'keywords'" (click)="activeTab.set('keywords')">Keywords</button>
  <button class="sr-section-tab" [class.active]="activeTab() === 'grammar'" (click)="activeTab.set('grammar')">Grammar</button>
</div>

<!-- Content panels -->
@if (activeTab() === 'story')    { <lc-story-tab    ...></lc-story-tab> }
@if (activeTab() === 'quiz')     { <lc-quiz-tab     ...></lc-quiz-tab> }
@if (activeTab() === 'keywords') { <lc-keywords-tab ...></lc-keywords-tab> }
@if (activeTab() === 'grammar')  { <lc-grammar-tab  ...></lc-grammar-tab> }
```

#### SCSS for tab bar
```scss
.sr-section-tabs {
  display: flex;
  padding: 0 16px 0;
  border-bottom: 1px solid var(--lc-border);
  background: white;
  position: sticky;
  top: 0;
  z-index: 10;
}

.sr-section-tab {
  flex: 1;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--lc-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 20px;
  font-family: var(--lc-font-body);
  transition: background 0.15s, color 0.15s;

  &.active {
    background: var(--lc-brand);
    color: white;
    font-weight: 600;
  }
}
```

#### Acceptance criteria
- [ ] Four tabs render in a single row below the story cover area
- [ ] Active tab has brand-green background, white text
- [ ] Inactive tabs are plain text (no border, no background)
- [ ] Tapping a tab switches the content area instantly (no animation needed for MVP)
- [ ] Audio player bar is **only visible** when `activeTab() === 'story'`
- [ ] Default tab on page load is `'story'`
- [ ] Translation toggle (within Story tab) still functions correctly

---

### LC-R06 · Frontend: Story tab — redesigned header area

**Epic:** Story Reader Redesign  
**Phase:** 2 — Reader shell  
**Points:** 2  
**Depends on:** LC-R05

#### User story
As a language learner, I want the story header to show a cover image with the story title, level badge, and action buttons (Mark as learned, settings), matching the visual reference, so that the reading experience feels more immersive.

#### Design (from screenshots)
```
┌─────────────────────────────────────────┐
│  [←]           [✓ Mark as learned] [≡] │  ← sticky top nav
│                                         │
│   [story cover image — full width]      │  ← ~180px tall, photo from story topic
│                                         │
└─────────────────────────────────────────┘
[ Story ] [ Quiz ] [ Keywords ] [ Grammar ]   ← tab bar (sticky)
```

Below the cover image (on Story tab only), the story title and meta row appear:
```
"Namibia: adventure, wildlife, and stunning nature"
[A1]  [🔄 translate icon]  [Aa font size]  [♡ favourite]
```

The translation toggle moves **from a tab** to an inline button (🔄 icon) in this meta row.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | Add `.sr-cover-image`, `.sr-story-meta-row` |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | Add `isFavourite = signal(false)`, `toggleFavourite()` |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | Style cover image, meta row |
| `apps/api/src/stories/story.entity.ts` | Add `coverImageUrl` nullable column |
| `libs/shared/domain/src/index.ts` | Add `coverImageUrl?: string` to `Story` |

#### Translation toggle behaviour
- The translation icon (🔄) is an inline toggle button in the meta row (Story tab only)
- When active: translations appear below each German sentence (teal-coloured text, as in screenshot 7)
- When inactive: only German text shown

#### Favourite behaviour
- The ♡ icon marks the story as favourite (stored locally via `StoryStore`, synced to API via `PATCH /stories/:id`)
- Heart fills (♥) when active

#### Acceptance criteria
- [ ] Cover image renders at full width, ~180px height, `object-fit: cover`
- [ ] If no `coverImageUrl`, a gradient fallback using brand colours is shown
- [ ] Title renders in display font below the tab bar (Story tab)
- [ ] Level pill (A1/A2/B1/B2) shown in meta row with correct colour coding
- [ ] Translation toggle (🔄 icon) toggles inline translations on/off within Story tab
- [ ] Favourite (♡/♥) icon toggles — tapping saves to store + API
- [ ] "Mark as learned" button in top nav is a real tappable action (calls `PATCH /stories/:id/learned`)
- [ ] All existing story/karaoke functionality continues to work unchanged

---

### LC-R07 · Frontend: Story tab — translation as inline toggle

**Epic:** Story Reader Redesign  
**Phase:** 2 — Reader shell  
**Points:** 1  
**Depends on:** LC-R06

#### User story
As a language learner, I want to toggle translations on/off with a single tap on the 🔄 icon in the story header, so that I can read purely in German when I want to challenge myself, and reveal translations when I'm stuck.

#### Behaviour
When translations are **on**: each German sentence in the story text is followed immediately by its English translation in teal/brand-mid colour, smaller font, italic — matching screenshot 7 (the Story tab in the reference images).

When translations are **off**: only German text is shown, no English lines.

This replaces the old "🇬🇧 Translation" tab which showed a separate bilingual sentence-pair view. The new approach shows translations inline, sentence by sentence.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | Render `sent.english` inline when `showTranslation()` is true |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | `.sr-sent-en` inline style |

#### HTML pattern (within Story tab content)
```html
@for (sent of story().sentences; track sent.index) {
  <div class="sr-sentence-block">
    <p class="sr-sent-de" [class.active-sent]="isActiveSentence(sent.index)">
      <!-- word-by-word spans for karaoke (existing logic) -->
    </p>
    @if (showTranslation()) {
      <p class="sr-sent-en">{{ sent.english }}</p>
    }
  </div>
}
```

#### Acceptance criteria
- [ ] Translation toggle icon in meta row toggles `showTranslation` signal
- [ ] When on: English translation renders below each German sentence in teal, ~13px, italic
- [ ] When off: only German text shown — no layout shift, no jump
- [ ] Audio player and karaoke highlighting still function correctly with translations visible
- [ ] Active sentence (currently playing) highlighted with brand-light background on both DE and EN lines
- [ ] State resets to `off` when navigating away and back

---

### LC-R08 · Frontend: Quiz tab — fill-in-the-blank UI

**Epic:** Story Reader Redesign  
**Phase:** 3 — New tabs  
**Points:** 4  
**Depends on:** LC-R05, LC-R02

#### User story
As a language learner, I want to answer fill-in-the-blank grammar questions about the story I just read, so that I can actively test my understanding instead of just passively listening.

#### Design (from screenshots — image 1)
```
┌─────────────────────────────────────────┐
│             [progress ring: 1/4]        │  ← green blob background with dotted ring
└─────────────────────────────────────────┘
[ Story ] [ Quiz ] [ Keywords ] [ Grammar ]

         🔊  (audio icon — plays the full sentence)

  "Man kann auch unter ___ Sternenhimmel schlafen."

         ┌─────────────────────────────┐
         │            das              │
         └─────────────────────────────┘
         ┌─────────────────────────────┐
         │            den              │
         └─────────────────────────────┘
         ┌─────────────────────────────┐
         │            dem              │
         └─────────────────────────────┘

  [▶ story]  [1x]  [↺]   ← persistent mini player at bottom
```

#### Files to create

| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.ts` | Quiz tab standalone component |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.html` | Template |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.scss` | Styles |

#### Component logic
```typescript
@Component({ selector: 'lc-quiz-tab', standalone: true })
export class QuizTabComponent {
  @Input() questions: StoryQuizQuestion[] = [];
  @Input() storyAudioUrl: string | null = null;

  readonly currentIdx = signal(0);
  readonly answered = signal<Map<string, string>>(new Map()); // questionId → chosen answer
  readonly showFeedback = signal(false);

  readonly currentQuestion = computed(() => this.questions[this.currentIdx()] ?? null);
  readonly progressLabel = computed(() => `${this.currentIdx() + 1}/${this.questions.length}`);
  readonly progressPct = computed(() => ((this.currentIdx() + 1) / this.questions.length) * 100);

  // All answer choices in randomised order (correct + distractors)
  readonly choices = computed(() => {
    const q = this.currentQuestion();
    if (!q) return [];
    return shuffle([q.correctAnswer, ...q.distractors]);
  });

  selectAnswer(choice: string): void {
    const q = this.currentQuestion();
    if (!q || this.showFeedback()) return;
    this.answered.update(m => new Map(m).set(q.id, choice));
    this.showFeedback.set(true);
    // Auto-advance after 1.5s
    setTimeout(() => {
      this.showFeedback.set(false);
      if (this.currentIdx() < this.questions.length - 1) {
        this.currentIdx.update(i => i + 1);
      }
    }, 1500);
  }

  isCorrect(choice: string): boolean {
    return choice === this.currentQuestion()?.correctAnswer;
  }

  wasChosen(choice: string): boolean {
    const q = this.currentQuestion();
    return q ? this.answered().get(q.id) === choice : false;
  }

  playQuestionAudio(): void {
    // Play TTS of the full sentence (currentQuestion().audioSentence or generate on-the-fly)
    // Use PronunciationService or a simple Audio element
  }
}
```

#### Progress ring (top area)
The progress ring is a circular SVG indicator showing current question / total. It sits in a brand-green blob (organic shape via `border-radius` trick or SVG blob). Use a CSS `conic-gradient` circle or SVG `stroke-dasharray` for the progress arc.

#### Acceptance criteria
- [ ] Quiz tab renders when `activeTab() === 'quiz'`
- [ ] If `story.quizQuestions` is empty, show "Quiz not available for this story" state
- [ ] Progress ring at top shows `currentIdx + 1 / total` with correct fill
- [ ] Question sentence renders with `___` blank (template from `sentenceTemplate`)
- [ ] Audio icon (🔊) plays the full sentence when tapped
- [ ] Three answer buttons render with the choices (shuffled on each question load)
- [ ] Tapping an answer: correct → button turns green, wrong → button turns red + correct answer shown green
- [ ] After 1.5s, auto-advance to next question
- [ ] After final question: show completion state ("Quiz complete! You answered X/N correctly")
- [ ] The persistent mini player at the bottom (`[▶ story] [1x] [↺]`) remains visible

---

### LC-R09 · Frontend: Quiz tab — answer feedback states

**Epic:** Story Reader Redesign  
**Phase:** 3 — New tabs  
**Points:** 2  
**Depends on:** LC-R08

#### User story
As a language learner, I want immediate visual feedback when I answer a quiz question — green for correct, red for wrong — so that I learn from my mistakes in the moment.

#### Feedback design
- **Correct:** chosen button background → `#D1FAE5` (green-tint), border → `#059669`, text → `#059669`, a subtle checkmark or animation
- **Wrong:** chosen button background → `#FEF2F2` (red-tint), border → `#FCA5A5`, text → `#B91C1C`; the correct answer button simultaneously turns green
- **Hint:** if `question.hint` exists, it appears below the buttons in small teal italic text after a wrong answer
- No retry — questions advance after feedback. The final score summary shows total correct/wrong.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.html` | Add feedback CSS classes |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.scss` | `.choice-correct`, `.choice-wrong`, `.choice-reveal`, `.quiz-hint` |

#### SCSS
```scss
.choice-btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 1.5px solid var(--lc-border);
  background: var(--lc-brand-light);
  color: var(--lc-brand);
  font-size: 15px;
  font-family: var(--lc-font-body);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;

  &.chosen-correct {
    background: #D1FAE5;
    border-color: #059669;
    color: #059669;
  }

  &.chosen-wrong {
    background: #FEF2F2;
    border-color: #FCA5A5;
    color: #B91C1C;
  }

  &.reveal-correct {
    background: #D1FAE5;
    border-color: #059669;
    color: #059669;
  }
}

.quiz-hint {
  font-size: 12px;
  color: var(--lc-brand-mid);
  font-style: italic;
  text-align: center;
  margin-top: 10px;
}
```

#### Acceptance criteria
- [ ] Correct answer: chosen button turns green immediately on tap
- [ ] Wrong answer: chosen button turns red; correct button turns green
- [ ] Grammar hint renders below buttons (if present) after wrong answer
- [ ] All buttons disabled after an answer is selected (prevent double-tap)
- [ ] Auto-advance after 1.5s delay from feedback appearing
- [ ] Final screen shows: "X / N correct" with emoji, a "Retake quiz" button, and "Back to story" button

---

### LC-R10 · Frontend: Keywords tab — vocabulary list

**Epic:** Story Reader Redesign  
**Phase:** 3 — New tabs  
**Points:** 3  
**Depends on:** LC-R05, LC-R04

#### User story
As a language learner, I want to see all keywords from the story in a scrollable list with their level, type, and translation, so that I can study the vocabulary before or after reading.

#### Design (from screenshots — image 2)
```
┌──────────────────────────────────────────────────┐
│  [story cover image]                              │
└──────────────────────────────────────────────────┘
[ Story ] [ Quiz ] [ Keywords ] [ Grammar ]

  ┌─────────────────────────────────────────────┐
  │  📋  Memorize keywords  →                   │  ← CTA button (brand green)
  └─────────────────────────────────────────────┘

  ┌──────────────────────────────────┬──────────┐
  │ [A1] besuchen  - verb            │  [⚖]    │
  │      to visit, to attend         │  [▶]    │
  └──────────────────────────────────┴──────────┘
  ┌──────────────────────────────────┬──────────┐
  │ [A1] wandern  - verb             │  [⚖]    │
  │      to hike, to travel          │  [▶]    │
  └──────────────────────────────────┴──────────┘
  ... (scrollable)
```

The level badge is a small coloured pill (A1 = green, A2 = green, B1 = amber, B2 = blue).  
The `[⚖]` dumbbell icon = "Add to training" (add card to a review session).  
The `[▶]` play icon = play pronunciation audio.

#### Files to create

| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.ts` | Keywords tab standalone component |
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.html` | Template |
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.scss` | Styles |

#### Component logic
```typescript
@Component({ selector: 'lc-keywords-tab', standalone: true })
export class KeywordsTabComponent {
  @Input() keywords: StoryKeyword[] = [];

  levelStyle(level: string): { background: string; color: string } {
    const map: Record<string, { background: string; color: string }> = {
      A1: { background: '#D1FAE5', color: '#059669' },
      A2: { background: '#D1FAE5', color: '#059669' },
      B1: { background: '#FEF3C7', color: '#D97706' },
      B2: { background: '#EAF2FC', color: '#1A56A3' },
      C1: { background: '#EDE9FE', color: '#6D28D9' },
      C2: { background: '#EDE9FE', color: '#6D28D9' },
    };
    return map[level] ?? { background: '#F1EFE8', color: '#5F5E5A' };
  }

  playWord(keyword: StoryKeyword): void {
    // Use PronunciationService.play() if cardId exists, else generate TTS inline
  }

  addToTraining(keyword: StoryKeyword): void {
    // Navigate to vault with pre-selected card, or open "add to collection" sheet
  }

  memorizeAll(): void {
    // Start a review session with all cards from this story's keywords
  }
}
```

#### Acceptance criteria
- [ ] Keywords tab renders when `activeTab() === 'keywords'`
- [ ] "Memorize keywords" CTA button at the top → starts a review session with story keyword cards
- [ ] Each keyword row shows: level pill, German word in bold, word type in grey (`- verb`), English translation below
- [ ] Dumbbell (⚖) icon: tapping adds the word to review training
- [ ] Play (▶) icon: tapping plays pronunciation audio
- [ ] List is scrollable; cover image remains visible above tabs
- [ ] Empty state if `keywords` array is empty: "No keywords available for this story"

---

### LC-R11 · Frontend: Grammar tab — expandable grammar rule cards

**Epic:** Story Reader Redesign  
**Phase:** 3 — New tabs  
**Points:** 3  
**Depends on:** LC-R05, LC-R03

#### User story
As a language learner, I want to read grammar explanations specific to the story I just read, with example sentences and optional conjugation tables, so that I understand *why* certain German constructions are used, not just *what* they mean.

#### Design (from screenshots — images 3, 4, 5)
```
[ Story ] [ Quiz ] [ Keywords ] [ Grammar ]

  ┌────────────────────────────────────────────┐
  │  Use of "manche" as an article or as an    │  ← brand-green header (always visible)
  │  indefinite pronoun                        │
  ├────────────────────────────────────────────┤
  │  Example                                   │  ← teal label
  │  Manche Dünen haben roten Sand.            │
  ├────────────────────────────────────────────┤
  │  Description                               │  ← teal label
  │                                            │
  │  The word manche denotes a number of...    │
  │  ...                                       │
  │                                            │
  │  ┌──────────────────────────────────────┐  │
  │  │ Manche Leute sind einverstanden.     │  │  ← example card
  │  │ Some people agree.                   │  │
  │  └──────────────────────────────────────┘  │
  └────────────────────────────────────────────┘

  ┌────────────────────────────────────────────┐
  │  Modal verb "können"                       │  ← second grammar note
  │  ...                                       │
  └────────────────────────────────────────────┘
```

The conjugation table (image 5) appears inside the Description section when the grammar note includes one.

#### Files to create

| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.ts` | Grammar tab standalone component |
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.html` | Template |
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.scss` | Styles |

#### Component template structure
```html
<div class="grammar-tab">
  @for (note of grammarNotes; track note.id) {
    <div class="grammar-card">
      <!-- Title — brand green background -->
      <div class="grammar-card-title">{{ note.title }}</div>

      <!-- Example section -->
      <div class="grammar-section">
        <div class="grammar-section-label">Example</div>
        <p class="grammar-example-de" [innerHTML]="boldKeywords(note.exampleDe)"></p>
      </div>

      <!-- Description section -->
      <div class="grammar-section">
        <div class="grammar-section-label">Description</div>
        <div class="grammar-description">{{ note.description }}</div>

        <!-- Conjugation table if present -->
        @if (note.conjugationTable) {
          <div class="grammar-table">
            @for (row of note.conjugationTable; track row.pronoun) {
              <div class="grammar-table-row">
                <span class="grammar-table-pronoun">{{ row.pronoun }}</span>
                <span class="grammar-table-form">{{ row.form }}</span>
              </div>
            }
          </div>
        }

        <!-- Additional examples -->
        @for (ex of note.additionalExamples; track $index) {
          <div class="grammar-example-card">
            <p class="grammar-ex-de" [innerHTML]="boldKeywords(ex.de)"></p>
            <p class="grammar-ex-en">{{ ex.en }}</p>
          </div>
        }
      </div>
    </div>
  }

  @if (!grammarNotes.length) {
    <div class="grammar-empty">No grammar notes available for this story.</div>
  }
</div>
```

#### Acceptance criteria
- [ ] Grammar tab renders when `activeTab() === 'grammar'`
- [ ] Each grammar note is a single unfolded card (no accordion needed — all expanded by default, matching screenshots)
- [ ] Card title has brand-green background, white text
- [ ] "Example" and "Description" section labels are teal coloured
- [ ] Grammar keywords in example sentences are **bold** (e.g. `Manche` in the example)
- [ ] Description text renders as plain paragraphs (line breaks preserved)
- [ ] If a conjugation table exists on the note, it renders as a two-column grid (pronoun | conjugated form)
- [ ] Additional example cards render as rounded cards with German above / English below, separated by a subtle divider
- [ ] Empty state shown if `grammarNotes` is empty

---

### LC-R12 · Frontend: Persist quiz progress across tab switches

**Epic:** Story Reader Redesign  
**Phase:** 4 — Polish  
**Points:** 2  
**Depends on:** LC-R08

#### User story
As a language learner, I want my quiz progress to be saved when I switch to another tab and come back, so that I don't lose my place if I check the keywords mid-quiz.

#### Problem
The current `@if (activeTab() === 'quiz')` pattern destroys and recreates the `QuizTabComponent` every time the user switches tabs, resetting all signals.

#### Solution
Lift quiz state from `QuizTabComponent` into `StoryReaderPage` and pass it as `@Input()` to the quiz tab. Alternatively, use Angular's `@defer` with `preserve` mode or keep all four panels in the DOM with `display: none` toggling.

**Recommended approach:** Move `currentIdx`, `answered` signals to `StoryReaderPage` and pass them down to `QuizTabComponent` via `@Input()`.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | Add `quizCurrentIdx`, `quizAnswered` signals |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.ts` | Accept state as `@Input()`, emit changes via `@Output()` |

#### Acceptance criteria
- [ ] Switching from Quiz → Keywords → Quiz restores the question the user was on
- [ ] Already-answered questions show their answer state (green/red) when revisiting
- [ ] Quiz resets only when the story page is navigated away from (not on tab switch)
- [ ] Final completion screen is preserved if the user already finished the quiz

---

### LC-R13 · Frontend: "Mark as learned" action

**Epic:** Story Reader Redesign  
**Phase:** 4 — Polish  
**Points:** 2  
**Depends on:** LC-R06

#### User story
As a language learner, I want to mark a story as "learned" from the top navigation bar so that I can track which stories I've fully studied.

#### Design (from screenshots)
A `✓ Mark as learned` pill button in the top-right of the nav bar (alongside a ≡ settings icon). Once tapped, it changes to `✓ Learned` with a filled green background.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | Add `isLearned = signal(false)`, `markAsLearned()` |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | Render learned button |
| `libs/shared/domain/src/index.ts` | Add `isLearned?: boolean` to `Story` |
| `apps/api/src/stories/story.entity.ts` | Add `isLearned: boolean` column |
| `apps/api/src/stories/stories.controller.ts` | Add `PATCH /stories/:id/learned` endpoint |
| `apps/mobile/src/app/features/stories/services/story-api.service.ts` | Add `markLearned(id)` method |

#### Acceptance criteria
- [ ] "✓ Mark as learned" button visible in top-right nav area on all four tabs
- [ ] Tapping it calls `PATCH /stories/:id/learned` and updates `story.isLearned = true` in the store
- [ ] Button visually changes to a filled/active state after tapping
- [ ] If story already has `isLearned: true` on load, button loads in active state
- [ ] Tapping again toggles it off (unmark as learned)

---

## Implementation Order

Work through these in this sequence to avoid blocked dependencies:

1. **LC-R01** — Domain types (unblocks everything)
2. **LC-R02** — Quiz generation (backend)
3. **LC-R03** — Grammar generation (backend)
4. **LC-R04** — Keyword enrichment (backend)
5. **LC-R05** — Four-tab nav shell (frontend, needed before any tab content)
6. **LC-R06** — Story tab header redesign
7. **LC-R07** — Translation as inline toggle
8. **LC-R08** — Quiz tab UI
9. **LC-R09** — Quiz feedback states
10. **LC-R10** — Keywords tab
11. **LC-R11** — Grammar tab
12. **LC-R12** — Quiz progress persistence
13. **LC-R13** — Mark as learned

---

## Files Created / Modified Summary

### New files

| File | Story |
|---|---|
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.ts` | LC-R08 |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.html` | LC-R08 |
| `apps/mobile/src/app/features/stories/components/quiz-tab/quiz-tab.component.scss` | LC-R08 |
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.ts` | LC-R10 |
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.html` | LC-R10 |
| `apps/mobile/src/app/features/stories/components/keywords-tab/keywords-tab.component.scss` | LC-R10 |
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.ts` | LC-R11 |
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.html` | LC-R11 |
| `apps/mobile/src/app/features/stories/components/grammar-tab/grammar-tab.component.scss` | LC-R11 |

### Modified files

| File | Stories |
|---|---|
| `libs/shared/domain/src/index.ts` | LC-R01, LC-R06, LC-R13 |
| `apps/api/src/stories/story.entity.ts` | LC-R01, LC-R02, LC-R03, LC-R04, LC-R06, LC-R13 |
| `apps/api/src/stories/story-generation.service.ts` | LC-R02, LC-R03, LC-R04 |
| `apps/api/src/stories/story-prompt.builder.ts` | LC-R02, LC-R03 |
| `apps/api/src/stories/stories.controller.ts` | LC-R13 |
| `apps/mobile/src/app/features/stories/services/story-api.service.ts` | LC-R13 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` | LC-R05, LC-R06, LC-R07, LC-R12, LC-R13 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.html` | LC-R05, LC-R06, LC-R07, LC-R08, LC-R09, LC-R10, LC-R11 |
| `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.scss` | LC-R05, LC-R06, LC-R09 |

---

## Non-goals (out of scope for this epic)

- Text-to-speech for individual grammar examples (future — pronunciation service already in place for vocab words)
- User editing of AI-generated quiz or grammar content
- Social/sharing of quiz scores
- Spaced-repetition integration for quiz wrong answers
- Grammar bookmark/save feature
- Offline quiz (quiz requires `quizQuestions` array present on the story — already cached with story on first load)