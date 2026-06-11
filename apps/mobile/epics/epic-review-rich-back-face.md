# Epic: Review Back Face — Rich Detail Panel
## Plural · Example Sentences · Synonyms with Examples on Card Reveal

> **Epic Number:** LC-350 (continuing from LC-138 / LC-345)
> **Feature Areas:**
> - `apps/mobile/src/app/features/review/pages/review/review.page.html` — back face template
> - `apps/mobile/src/app/features/review/pages/review/review.card.scss` — new section styles
> - `apps/mobile/src/app/features/review/pages/review/review.page.ts` — synonym expand state
> **Ticket numbers:** LC-350 through LC-355
> **Depends on:** LC-133/LC-134 (synonyms & plural data model) — data must exist in `CardContent`

---

## Context & The Problem

The current review back face shows the German word, article/gender, phonetic, and example sentences — and nothing else. The previous synonyms+plurals epic (LC-133–142) deliberately excluded synonyms from the review card with this rationale:

> "Don't overload the review card. The review back face is a recall surface; piling synonyms onto it dilutes the test. Synonyms live on the detail page and Listen."

**That principle made sense at the time, but the assumption it rests on is wrong for the primary use pattern.** Users overwhelmingly navigate: Review → rate → next card. They rarely pause to open word detail. The detail page is reachable only by exiting the review session and searching the vault — a context switch most users never make mid-session.

The evidence from the current screenshots is clear:
- The back face has a large **empty grey void** below the example sentence block and above the rating buttons — wasted space that could be richly educational.
- The word detail page contains `plural`, `mastery progress`, `example sentences`, and expandable synonym rows with their own example sentences and audio — all of which users miss entirely during their primary study activity.

**The fix:** convert the back face into a **scrollable rich detail panel** that surfaces plural, examples, and synonym rows (with collapsible example sentences) inside the card itself — using the same progressive-disclosure pattern from the word detail page. The front face and the rating flow are completely unchanged.

### Design principle revision

The original principle 3 is replaced by:

> **Show everything needed to learn, not just what was tested.** The back face is where learning deepens — the answer was either recalled or not. After confirming or correcting themselves, users benefit most from *using* that moment to absorb plural forms, sentence context, and synonym nuance. Progressive disclosure (collapsed synonym rows) keeps the card scannable while making the full content one tap away.

---

## System Analysis

### Current back face content

**File:** `apps/mobile/src/app/features/review/pages/review/review.page.html`

```
@if (isFlipped()) {
  <div class="rv-card rv-card--back">
    <!-- article badge + gender -->
    <!-- word (large) -->
    <!-- phonetic (if present) -->
    <!-- plural pill (LC-140 — if present) -->
    <!-- example blocks (rv-ex-block) -->
    <!-- play pronunciation button -->
  </div>
}
```

The card is not scrollable. It's a fixed flex column that fills the card's natural height. On most cards this leaves the lower third of the card blank.

### Current example sentence structure (`CardContent`)

```typescript
export interface ExampleSentence {
  targetLang: string;   // German sentence
  nativeLang: string;   // English translation
}

export interface Synonym {
  word: string;
  article: ArticleType | null;
  translation: string;
  example: string;          // German example sentence
  exampleNative: string;    // English translation of example
}

export interface CardContent {
  front: string;
  back: string;
  article: ArticleType | null;
  gender: GenderType;
  plural: string | null;           // added in LC-133
  examples: ExampleSentence[];
  synonyms: Synonym[];             // added in LC-133
  // ...
}
```

All required data is already in the domain model — this epic is purely a UI change.

### Component state

**File:** `apps/mobile/src/app/features/review/pages/review/review.page.ts`

The word-detail component uses a `Set`-based signal for expanded synonym rows:

```typescript
private expanded = signal<Set<number>>(new Set());
toggleSynonym(i: number): void {
  const next = new Set(this.expanded());
  this.expanded().has(i) ? next.delete(i) : next.add(i);
  this.expanded.set(next);
}
isExpanded = (i: number) => this.expanded().has(i);
```

The same pattern needs to land in `review.page.ts`. The expanded state must reset when the card advances (via `currentIndex` change). A `computed` or `effect` listening to `currentIndex` handles this.

### Files to touch

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.ts` | Add `expandedSynonyms` signal, `toggleReviewSynonym()`, `isReviewSynonymExpanded()`, reset on card advance |
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Make back face card scrollable; add Synonyms section below examples |
| `apps/mobile/src/app/features/review/pages/review/review.card.scss` | Add `.rv-syn-*` styles, scrollable card modifier, section divider |

---

## Target Architecture

### Scrollable card approach

The back face card gains `overflow-y: auto` and a `max-height` that allows it to fill the available area between the progress bar and the rating buttons — without growing past the screen. The rating bar stays pinned at the bottom (it is outside the card, in `.rv-footer`).

```scss
// review.card.scss — NEW
.rv-card--back-scrollable {
  overflow-y: auto;
  // iOS momentum scrolling
  -webkit-overflow-scrolling: touch;
  // Don't overflow into the rating bar — the session layout handles this
  max-height: 100%;
}

.rv-sec-divider {
  width: 100%;
  height: 1px;
  background: var(--lc-border);
  margin: 14px 0 12px;
}

.rv-sec-hdr {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--lc-text-hint);
  margin-bottom: 10px;
}
```

### Synonym section

Reuses the pattern from `word-detail.component.html`. Each row is collapsed by default; tapping it toggles the example sentence block.

```scss
.rv-syn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--lc-border);
  cursor: pointer;
  user-select: none;

  &:last-child { border-bottom: none; }
}

.rv-syn-word {
  font-size: 14px;
  font-weight: 600;
  color: var(--lc-text-primary);
  flex: 1;
}

.rv-syn-trans {
  font-size: 11px;
  color: var(--lc-text-secondary);
  margin-left: 2px;
}

.rv-syn-chevron {
  font-size: 12px;
  color: var(--lc-text-hint);
  transition: transform var(--lc-transition-fast);

  &.open { transform: rotate(180deg); }
}

.rv-syn-ex-block {
  background: var(--lc-surface);
  border-radius: var(--lc-radius-md);
  padding: 10px 12px;
  margin-bottom: 6px;

  .rv-ex-de strong { color: var(--lc-brand); font-weight: 600; }
}
```

### Template structure (back face)

```html
@else {
  <!-- Back face (revealed) — scrollable -->
  <div class="rv-card rv-card--back rv-card--back-scrollable">

    <!-- ── Identity header ── -->
    <div class="rv-card-hdr">
      <span class="rv-side-lbl">{{ currentCard().content.front }}</span>
      <span class="rv-lang-chip">🇩🇪 German</span>
    </div>

    <div class="rv-body-back">
      <!-- Article + gender -->
      @if (currentCard().content.article) {
        <div class="rv-art-row">
          <lc-article-badge class="rv-art-badge"
            [article]="currentCard().content.article" />
          <span class="rv-art-gender">{{ articleGender() }}</span>
        </div>
      }

      <!-- Word -->
      <p class="rv-back-word lc-display">{{ currentCard().content.back }}</p>

      <!-- Phonetic -->
      @if (currentCard().content.phonetic) {
        <p class="rv-phonetic">{{ currentCard().content.phonetic }}</p>
      }

      <!-- Plural pill -->
      @if (currentCard().content.plural) {
        <div class="rv-plural">
          <span class="rv-plural-lbl">Plural</span>
          <span class="rv-plural-val">{{ currentCard().content.plural }}</span>
        </div>
      }

      <!-- Play pronunciation -->
      <button class="rv-audio-btn" (click)="playAudio($event)">
        <ion-icon name="volume-medium-outline"></ion-icon>
        Play pronunciation
      </button>

      <!-- ── Example sentences ── -->
      @if (currentCard().content.examples?.length) {
        <div class="rv-sec-divider"></div>
        @for (ex of currentCard().content.examples; track $index) {
          <div class="rv-ex-block">
            <div class="rv-ex-row">
              <p class="rv-ex-de" [innerHTML]="highlightWord(ex.targetLang,
                currentCard().content.back)"></p>
              <button class="rv-ex-play-btn"
                (click)="playExample($event, ex.targetLang)"
                aria-label="Play example">
                <ion-icon name="volume-medium-outline"></ion-icon>
              </button>
            </div>
            <p class="rv-ex-en">"{{ ex.nativeLang }}"</p>
          </div>
        }
      }

      <!-- ── Synonyms ── -->
      @if (currentCard().content.synonyms?.length) {
        <div class="rv-sec-divider"></div>
        <p class="rv-sec-hdr">Synonyms</p>

        @for (syn of currentCard().content.synonyms; track $index) {
          <div class="rv-syn-row" (click)="toggleReviewSynonym($index)">
            @if (syn.article) {
              <lc-article-badge [article]="syn.article" />
            }
            <span class="rv-syn-word">{{ syn.word }}</span>
            <span class="rv-syn-trans">{{ syn.translation }}</span>
            <ion-icon
              name="chevron-down-outline"
              class="rv-syn-chevron"
              [class.open]="isReviewSynonymExpanded($index)">
            </ion-icon>
          </div>

          @if (isReviewSynonymExpanded($index) && syn.example) {
            <div class="rv-syn-ex-block">
              <div class="rv-ex-row">
                <p class="rv-ex-de"
                  [innerHTML]="highlightWord(syn.example, syn.word)"></p>
                <button class="rv-ex-play-btn"
                  (click)="playExample($event, syn.example)"
                  aria-label="Play synonym example">
                  <ion-icon name="volume-medium-outline"></ion-icon>
                </button>
              </div>
              <p class="rv-ex-en">"{{ syn.exampleNative }}"</p>
            </div>
          }
        }
      }
    </div>
  </div>
}
```

### Component changes (`review.page.ts`)

```typescript
// ─── Synonym expand state ──────────────────────────────────────────────────

private readonly expandedSynonyms = signal<Set<number>>(new Set());

constructor() {
  // Reset expanded synonyms whenever the user advances to a new card
  effect(() => {
    this.currentIndex();        // read signal to subscribe
    this.expandedSynonyms.set(new Set());
  });
}

toggleReviewSynonym(i: number): void {
  const next = new Set(this.expandedSynonyms());
  this.expandedSynonyms().has(i) ? next.delete(i) : next.add(i);
  this.expandedSynonyms.set(next);
}

isReviewSynonymExpanded(i: number): boolean {
  return this.expandedSynonyms().has(i);
}
```

---

## Story Map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 1 — Layout | LC-350 | Make review back face card scrollable | 1 |
| 2 — Synonyms | LC-351 | Add synonym section to review back face | 3 |
| 2 — Synonyms | LC-352 | Synonym expand state: reset on card advance | 1 |
| 3 — Polish | LC-353 | Synonym example audio playback from review card | 1 |
| 3 — Polish | LC-354 | Word highlight in synonym example sentences | 2 |
| 4 — Guard | LC-355 | Graceful empty-state guards (no synonyms, no examples) | 1 |

**Total: 9 points**

---

## Phase 1 — Layout

### LC-350 · Scrollable back face card

**Epic:** Review Rich Back Face
**Phase:** 1 — Layout
**Points:** 1
**Depends on:** nothing (pure layout change)

#### User story

As a user who just flipped a review card, I want to scroll the revealed face when the content is taller than my screen, so I can see all the detail without missing anything.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.card.scss` | Add `.rv-card--back-scrollable`, `.rv-sec-divider`, `.rv-sec-hdr` |
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Add `rv-card--back-scrollable` class to back face `div` |
| `apps/mobile/src/app/features/review/pages/review/review.page.scss` | Ensure `.rv-card-scene` uses `overflow: hidden` to contain the scroll |

#### Implementation

```scss
// review.card.scss — add to BACK FACE BODY section

.rv-card--back-scrollable {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  // Prevent the card from growing past the scene container
  max-height: 100%;
}

.rv-sec-divider {
  width: 100%;
  height: 1px;
  background: var(--lc-border);
  margin: 14px 0 12px;
  flex-shrink: 0;
}

.rv-sec-hdr {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--lc-text-hint);
  margin-bottom: 10px;
  align-self: flex-start;
}
```

```html
<!-- review.page.html — back face opening tag -->
<div class="rv-card rv-card--back rv-card--back-scrollable">
```

#### Acceptance criteria

- [ ] Back face scrolls when content overflows
- [ ] Rating buttons remain visible and do not scroll (they are outside the card)
- [ ] Front face is unchanged
- [ ] No horizontal overflow or layout jitter
- [ ] `tsc --noEmit` passes

---

## Phase 2 — Synonyms

### LC-351 · Synonym section on review back face

**Epic:** Review Rich Back Face
**Phase:** 2 — Synonyms
**Points:** 3
**Depends on:** LC-350, LC-133 (synonym data in `CardContent`)

#### User story

As a user who just revealed the German word on a review card, I want to see its synonyms (with translations) below the examples, so I can absorb usage nuance without leaving the review session.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Add synonym section below examples on back face |
| `apps/mobile/src/app/features/review/pages/review/review.card.scss` | Add `.rv-syn-*` styles |
| `apps/mobile/src/app/features/review/pages/review/review.page.ts` | Add `expandedSynonyms` signal + `toggleReviewSynonym()` + `isReviewSynonymExpanded()` |

#### Implementation

```typescript
// review.page.ts — add synonym expand state
private readonly expandedSynonyms = signal<Set<number>>(new Set());

toggleReviewSynonym(i: number): void {
  const next = new Set(this.expandedSynonyms());
  this.expandedSynonyms().has(i) ? next.delete(i) : next.add(i);
  this.expandedSynonyms.set(next);
}

isReviewSynonymExpanded(i: number): boolean {
  return this.expandedSynonyms().has(i);
}
```

```scss
// review.card.scss — synonym rows

.rv-syn-list {
  width: 100%;
}

.rv-syn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--lc-border);
  cursor: pointer;
  user-select: none;

  &:last-child { border-bottom: none; }
  &:active { opacity: 0.7; }
}

.rv-syn-word {
  font-size: 14px;
  font-weight: 600;
  color: var(--lc-text-primary);
  flex: 1;
}

.rv-syn-trans {
  font-size: 11px;
  color: var(--lc-text-secondary);
}

.rv-syn-chevron {
  color: var(--lc-text-hint);
  font-size: 14px;
  transition: transform var(--lc-transition-fast);
  flex-shrink: 0;

  &.open { transform: rotate(180deg); }
}

.rv-syn-ex-block {
  background: var(--lc-surface);
  border-radius: var(--lc-radius-md);
  padding: 10px 12px;
  margin-bottom: 6px;
  width: 100%;
}
```

```html
<!-- review.page.html — synonyms section (add at bottom of rv-body-back) -->
@if (currentCard().content.synonyms?.length) {
  <div class="rv-sec-divider"></div>
  <p class="rv-sec-hdr">Synonyms</p>
  <div class="rv-syn-list">
    @for (syn of currentCard().content.synonyms; track $index) {
      <div class="rv-syn-row" (click)="toggleReviewSynonym($index)">
        @if (syn.article) {
          <lc-article-badge [article]="syn.article" />
        }
        <span class="rv-syn-word">{{ syn.word }}</span>
        <span class="rv-syn-trans">{{ syn.translation }}</span>
        <ion-icon
          name="chevron-down-outline"
          class="rv-syn-chevron"
          [class.open]="isReviewSynonymExpanded($index)">
        </ion-icon>
      </div>

      @if (isReviewSynonymExpanded($index) && syn.example) {
        <div class="rv-syn-ex-block">
          <div class="rv-ex-row">
            <p class="rv-ex-de">{{ syn.example }}</p>
            <button class="rv-ex-play-btn"
              (click)="playExample($event, syn.example)"
              aria-label="Play synonym example">
              <ion-icon name="volume-medium-outline"></ion-icon>
            </button>
          </div>
          <p class="rv-ex-en">"{{ syn.exampleNative }}"</p>
        </div>
      }
    }
  </div>
}
```

#### Acceptance criteria

- [ ] Synonym section renders only when `currentCard().content.synonyms?.length > 0`
- [ ] Each row shows article badge (if present) + word + translation + chevron
- [ ] Rows are tappable and expand/collapse independently
- [ ] Section header "SYNONYMS" is uppercase, muted, 10px
- [ ] Section is separated from examples by a divider line
- [ ] No empty section rendered when synonyms array is empty or absent
- [ ] All styles use LDS tokens (`var(--lc-*)`)
- [ ] `tsc --noEmit` passes

---

### LC-352 · Reset synonym expand state on card advance

**Epic:** Review Rich Back Face
**Phase:** 2 — Synonyms
**Points:** 1
**Depends on:** LC-351

#### User story

As a user advancing to the next review card, I expect the synonym rows to be collapsed again so I start fresh — not see the previous card's expanded state carrying over.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.ts` | Add `effect()` to clear `expandedSynonyms` when `currentIndex` changes |

#### Implementation

```typescript
// review.page.ts — inside constructor or ngOnInit, after signals are declared

effect(() => {
  // Track currentIndex to reset synonym state on card advance
  this.currentIndex();
  this.expandedSynonyms.set(new Set());
});
```

**Note:** `effect()` runs in an injection context, so it must be called inside the constructor or an `inject()` context. If `DestroyRef` is already used in this component, wrap with `takeUntilDestroyed`.

#### Acceptance criteria

- [ ] All synonym rows are collapsed when a new card is shown
- [ ] Tapping Previous and returning to a card also resets the expand state
- [ ] No console errors from the effect
- [ ] `tsc --noEmit` passes

---

## Phase 3 — Polish

### LC-353 · Synonym example audio from review card

**Epic:** Review Rich Back Face
**Phase:** 3 — Polish
**Points:** 1
**Depends on:** LC-351

#### User story

As a user with a synonym expanded on a review card, I want to tap a play button to hear the synonym example sentence, just like I can on the main example sentences.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Play button in `rv-syn-ex-block` calls `playExample($event, syn.example)` |

The `playExample(event, sentence)` method already exists in `review.page.ts` — it calls `wordAudio.play(sentence, 'de-DE')`. This ticket is just wiring the template button to the existing method (LC-351 scaffolds the button; this ticket validates the audio call works and the icon library includes `volume-medium-outline`).

#### Acceptance criteria

- [ ] Tapping play in an expanded synonym example plays that sentence in German TTS
- [ ] Tapping play does NOT flip/advance the card (event.stopPropagation confirmed)
- [ ] Audio icon uses `volume-medium-outline` from ionicons (already imported in component)

---

### LC-354 · Highlight word in synonym example sentences

**Epic:** Review Rich Back Face
**Phase:** 3 — Polish
**Points:** 2
**Depends on:** LC-351

#### User story

As a user reading a synonym example, I want the synonym word to be visually highlighted in its example sentence, so I can immediately see where it appears in context — matching the behaviour on the word detail page.

#### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/app/features/review/pages/review/review.page.ts` | Add `highlightWord(sentence, word)` helper |
| `apps/mobile/src/app/features/review/pages/review/review.page.html` | Use `[innerHTML]` binding with `highlightWord()` for synonym examples |

#### Implementation

```typescript
// review.page.ts
highlightWord(sentence: string, word: string): string {
  if (!sentence || !word) return sentence ?? '';
  // Case-insensitive replacement; wrap match in <strong>
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<strong>$1</strong>'
  );
}
```

```html
<!-- review.page.html — synonym example sentence -->
<p class="rv-ex-de"
   [innerHTML]="highlightWord(syn.example, syn.word)"></p>
```

The existing CSS already handles `::ng-deep .rv-ex-de strong { color: var(--lc-brand); }` — this applies to the new synonym examples too.

#### Acceptance criteria

- [ ] The synonym headword is highlighted in brand-green in its example sentence
- [ ] Case-insensitive matching (handles capitalisation at sentence start)
- [ ] Sentences without the exact word render as plain text (no crash, no empty string)
- [ ] The same highlight already applied to main examples is consistent with this implementation
- [ ] `tsc --noEmit` passes

---

## Phase 4 — Guards

### LC-355 · Graceful empty-state guards

**Epic:** Review Rich Back Face
**Phase:** 4 — Guards
**Points:** 1
**Depends on:** LC-351, LC-354

#### User story

As a user reviewing a word without synonyms (e.g. a verb or a word added before the synonyms feature), I expect the review card to look clean — no empty headers or dividers.

#### Acceptance criteria

- [ ] No "SYNONYMS" header rendered when `synonyms` is `null`, `undefined`, or `[]`
- [ ] No section divider rendered when there are no synonyms to follow it
- [ ] No "EXAMPLES" divider rendered if `examples` is also empty (defensive)
- [ ] Cards with both synonyms and examples render both sections with their respective dividers
- [ ] Cards added before synonym data existed render identically to today

---

## ADR: Why synonyms belong on the review back face now

**Decision:** Add synonyms with collapsible examples to the review back face.

**Context:** The previous principle ("synonyms don't belong in review") was based on a pure recall-card mental model. But review cards in LinguaCard already show example sentences — they are not blank "what does this word mean?" cards. The back face is already an educational surface. Adding synonyms via progressive disclosure (collapsed rows) does not dilute the recall test because the recall moment is the flip itself; everything shown *after* the flip reinforces learning.

**Evidence for change:**
- Word detail is reached by exiting review → navigating vault → searching. This friction means ~0% of sessions result in word-detail views.
- The current back face has substantial blank space below examples.
- Spaced-repetition research (Karpicke & Roediger, Nation) supports elaboration after retrieval — seeing a synonym's usage sentence immediately after self-testing deepens the memory trace for both words.

**Alternatives considered:**
1. *Keep as-is* — wastes the prime learning moment when user attention is highest.
2. *Open word detail on card tap* — disruptive, breaks the review flow, exits the session context.
3. *Show synonym list only (no examples)* — a bare synonym list adds little over what the translation already conveys.

**Decision outcome:** Scrollable back face with collapsible synonym rows and example sentences. The collapse keeps the card scannable; the expand gives full context to users who want it.

---

## Non-goals

- No changes to the front face (recall question)
- No changes to the rating buttons or session flow
- No conjugation lookup or Story Studio tap-on-word integration (separate epic)
- No synonym audio prefetch at session start (follow-on if performance is an issue)
- No mastery progress stats on the review card (those belong on word detail only)
- No changes to word-detail page (synonyms already render there per LC-138)
