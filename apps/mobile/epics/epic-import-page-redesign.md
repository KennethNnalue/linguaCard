# Epic: Import Page Redesign — AI Prompt Helper

> **Ticket Range:** LC-346 – LC-352
> **Feature Area:** `features/vault/pages/import/`
> **Depends on:** Existing CSV import flow, existing image import flow
> **Total Points:** 18
> **Design Reference:** `import-page-redesign-reference.html`

---

## Context & Background

The current Import Words page (`/vault/import`) has a usability problem: after the CSV
drop zone, image import button, and template download, the page displays a raw **format
specification** that lists CSV column names (`front`, `back`, `article`, `synWord`,
`synArticle`…). This is developer-facing documentation — not actionable guidance for a user
who wants to import words.

**Observed problems:**

1. **Format spec is intimidating.** 22 possible columns with technical names like
   `exampleTarget` and `synExampleNative` make users feel this is a power-user feature.
2. **No guidance on *how* to create a CSV.** The spec tells users *what* columns exist but
   not how to actually produce one. Most users don't know how to create a CSV from scratch.
3. **Too many visual sections.** Four "or" dividers create visual noise. The page reads as a
   list of loosely related options rather than a guided flow.
4. **The drop zone is oversized.** On mobile it pushes all other options below the fold,
   making the image import and template download hard to discover.
5. **No connection to AI.** Users already have access to ChatGPT, Claude, Gemini, etc. — but
   the app never tells them they can use AI to generate import-ready CSVs.

### Files in play

| Layer | File | Current role |
|---|---|---|
| Template | `apps/mobile/src/app/features/vault/pages/import/import.page.html` | Drop zone + image btn + template download + format spec |
| Logic | `apps/mobile/src/app/features/vault/pages/import/import.page.ts` | File handling, navigation, template download |
| Styles | `apps/mobile/src/app/features/vault/pages/import/import.page.scss` | All `.imp-*` classes |
| Parser | `apps/mobile/src/app/shared/csv/csv-parser.service.ts` | CSV → `ParsedImportRow[]` (7 core + 15 synonym columns) |
| Backend prompt | `apps/api/src/import/word-enrich-prompt.builder.ts` | AI enrichment prompt (used as reference for the user-facing prompt) |

---

## Target Architecture

Replace the format spec section with an **AI Prompt Helper** — a guided card that helps
users generate a LinguaCard-compatible CSV using any AI tool. The prompt is derived from
our `WordEnrichPromptBuilder` but simplified for human consumption.

### Page layout (redesigned)

```
┌──────────────────────────────────┐
│  ← Import Words                  │  ← Header (unchanged)
├──────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐     │
│  │ 📸 Scan  │  │ 📄 Upload │     │  ← Method cards (new)
│  │  Image   │  │   CSV    │     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌──────────────────────────┐   │
│  │ 📁 Drop CSV here  Browse│   │  ← Compact drop zone (slimmed)
│  └──────────────────────────┘   │
│                                  │
│  ✨ Generate a CSV with AI       │  ← AI section header
│  Copy this prompt into any AI    │
│                                  │
│  ① Copy  →  ② Paste  →  ③ Upload│  ← 3-step guide
│                                  │
│  ┌──────────────────────────┐   │
│  │ AI PROMPT      [📋 Copy] │   │  ← Prompt card with copy button
│  │                          │   │
│  │  Create German vocab...  │   │
│  │  Columns: front,back...  │   │
│  │  [PASTE YOUR WORDS HERE] │   │
│  │                          │   │
│  │ ℹ Works with ChatGPT... │   │
│  └──────────────────────────┘   │
│                                  │
│  📥 Download CSV template        │  ← Template link (demoted to secondary)
│     95 pre-made words            │
└──────────────────────────────────┘
```

### The AI prompt

Two versions of the prompt exist:

- **Display version** — shown in the UI card, abbreviated for scannability (~120 words)
- **Clipboard version** — the full, detailed prompt copied when user taps "Copy" (~200 words, includes rules and examples)

Both output the 7 core CSV columns (`front,back,article,plural,category,exampleTarget,exampleNative`). Synonym columns are intentionally excluded — AI tools struggle with the 3×5 repeating column structure, and synonyms are better handled by server-side enrichment on import.

### Clipboard prompt (full text)

```
I have a list of German words I want to study. Create a CSV file with these exact column headers:

front,back,article,plural,category,exampleTarget,exampleNative

Column definitions:
- front: English translation (e.g. "dog")
- back: German word WITHOUT article (e.g. "Hund")
- article: der, die, or das — leave empty for verbs, adjectives, phrases
- plural: Full plural with article (e.g. "die Hunde") — leave empty for verbs
- category: One of: Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
- exampleTarget: A natural German sentence using the word
- exampleNative: English translation of that sentence

Rules:
- The "back" column must NEVER include the article — that goes in the "article" column only
- Wrap any field that contains commas in double quotes
- Include the header row as the first line
- Use correct German grammar in all sentences

Here are my German words:
[PASTE YOUR WORDS HERE — one per line]

Output ONLY the CSV with headers. No markdown fences. No explanations.
```

---

## Story Map

| Phase | Ticket | Title | Points |
|-------|--------|-------|--------|
| 1 — UI | LC-346 | Method cards + compact drop zone | 3 |
| 1 — UI | LC-347 | AI Prompt Helper section with copy-to-clipboard | 5 |
| 1 — UI | LC-348 | Remove format spec, demote template to secondary link | 2 |
| 2 — Polish | LC-349 | Copy confirmation state + toast feedback | 2 |
| 2 — Polish | LC-350 | Prompt constants file + display/clipboard versions | 2 |
| 3 — Future | LC-351 | Paste Words entry page (text input → enrichment) | 5 |
| 3 — Future | LC-352 | Wire Paste Words to enrichment endpoint + review flow | 5 |

**Phase 1 total: 10 points** (the immediate redesign)
**Phase 2 total: 4 points** (polish)
**Phase 3 total: 10 points** (future "Paste Words" flow — can be deferred)

---

## Phase 1 — UI Redesign

### LC-346 · Method cards + compact drop zone

**Phase:** 1 — UI
**Points:** 3
**Depends on:** nothing

#### User story

As a user opening the Import Words page, I want to see two clear entry points (Scan Image
and Upload CSV) as tappable cards at the top, so I immediately understand my options without
scrolling through dividers.

#### Files to modify

| File | Change |
|---|---|
| `import.page.html` | Replace large drop zone + first "or" divider + image button with method cards row + compact drop zone |
| `import.page.scss` | Add `.imp-methods`, `.imp-method-card`, `.imp-method-icon`, `.imp-drop-compact` styles; remove old `.imp-drop` padding |
| `import.page.ts` | No logic changes — `navigateToImageImport()` and `openFilePicker()` already exist |

#### Template changes

Replace the current top section (drop zone → "or scan an image" → image button → "or start with our template") with:

```html
<!-- Method cards -->
<div class="imp-methods">
  <button class="imp-method-card" (click)="navigateToImageImport()">
    <div class="imp-method-icon imp-method-icon--camera">
      <ion-icon name="camera-outline"></ion-icon>
    </div>
    <span class="imp-method-title">Scan Image</span>
    <span class="imp-method-sub">Photos, menus, flashcards</span>
  </button>

  <button class="imp-method-card" (click)="openFilePicker()">
    <div class="imp-method-icon imp-method-icon--csv">
      <ion-icon name="cloud-upload-outline"></ion-icon>
    </div>
    <span class="imp-method-title">Upload CSV</span>
    <span class="imp-method-sub">Bulk import from file</span>
  </button>
</div>

<!-- Compact drop zone -->
<div
  class="imp-drop-compact"
  [class.imp-drop-compact--active]="dragActive()"
  (dragover)="onDragOver($event)"
  (dragleave)="onDragLeave()"
  (drop)="onDrop($event)">
  <div class="imp-drop-compact-icon">
    <ion-icon name="document-outline"></ion-icon>
  </div>
  <div class="imp-drop-compact-text">
    <span class="imp-drop-compact-title">Drop a .csv file here</span>
    <span class="imp-drop-compact-sub">or tap to browse your files</span>
  </div>
  <button class="imp-browse-link" (click)="openFilePicker()">Browse</button>
</div>
```

#### SCSS — new classes

```scss
.imp-methods {
  display: flex; gap: t.$lc-space-2; padding: 0;
}

.imp-method-card {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: t.$lc-space-2;
  background: var(--lc-card); border: 1.5px solid var(--lc-border); border-radius: t.$lc-radius-lg;
  padding: t.$lc-space-4 t.$lc-space-2 t.$lc-space-3; cursor: pointer;
  transition: var(--lc-transition-fast); box-shadow: var(--lc-shadow-card);
  font-family: t.$lc-font-body;
  &:active { border-color: var(--lc-brand); background: var(--lc-brand-light); }
}

.imp-method-icon {
  @include u.flex-center; width: 44px; height: 44px; border-radius: t.$lc-radius-md;
  ion-icon { font-size: 22px; }
  &--camera { background: var(--lc-accent-light); ion-icon { color: var(--lc-accent); } }
  &--csv { background: var(--lc-brand-light); ion-icon { color: var(--lc-brand); } }
}

.imp-method-title { @include u.lc-font('sm', t.$lc-font-weight-semibold); color: var(--lc-text-primary); text-align: center; }
.imp-method-sub { @include u.lc-font('xs'); color: var(--lc-text-hint); text-align: center; line-height: 1.4; }

.imp-drop-compact {
  border: 2px dashed var(--lc-border); border-radius: t.$lc-radius-md + 2;
  background: var(--lc-card); padding: t.$lc-space-3;
  display: flex; align-items: center; gap: t.$lc-space-3; cursor: pointer;
  transition: border-color var(--lc-transition-fast), background var(--lc-transition-fast);
  &--active { border-color: var(--lc-brand); background: var(--lc-brand-light); }
}

.imp-drop-compact-icon {
  @include u.flex-center; width: 36px; height: 36px; border-radius: t.$lc-radius-sm + 2;
  background: var(--lc-brand-light); flex-shrink: 0;
  ion-icon { font-size: 18px; color: var(--lc-brand); }
}

.imp-drop-compact-text { flex: 1; }
.imp-drop-compact-title { @include u.lc-font('sm', t.$lc-font-weight-semibold); color: var(--lc-text-primary); display: block; }
.imp-drop-compact-sub { @include u.lc-font('xs'); color: var(--lc-text-hint); display: block; margin-top: 1px; }

.imp-browse-link {
  @include u.lc-font('xs', t.$lc-font-weight-semibold); color: var(--lc-brand);
  text-decoration: underline; cursor: pointer; flex-shrink: 0;
  background: none; border: none; font-family: t.$lc-font-body;
}
```

#### Acceptance criteria

- [ ] Two method cards render side-by-side below the header
- [ ] "Scan Image" card navigates to `/vault/import/image`
- [ ] "Upload CSV" card triggers the file picker
- [ ] Compact drop zone retains drag-and-drop functionality
- [ ] "Browse" link triggers `openFilePicker()` (same as current "Browse files" button)
- [ ] All old "or" dividers between the top three sections are removed
- [ ] Existing file processing logic is unchanged
- [ ] All styles use LDS tokens — no raw hex/px

---

### LC-347 · AI Prompt Helper section with copy-to-clipboard

**Phase:** 1 — UI
**Points:** 5
**Depends on:** LC-346

#### User story

As a user who wants to create a CSV but doesn't know how, I want to copy a pre-built AI
prompt from the import page, so I can paste it into any AI tool together with my word list
and get a properly formatted CSV back.

#### Files to modify / create

| File | Change |
|---|---|
| `import.page.html` | Add AI prompt helper section below the compact drop zone |
| `import.page.scss` | Add `.imp-ai-*`, `.imp-steps`, `.imp-prompt-*` styles |
| `import.page.ts` | Add `copyPrompt()` method, `promptCopied` signal, `addIcons` for new icons |

#### Template — AI Prompt Helper

```html
<!-- AI Prompt Helper -->
<div class="imp-ai-section">
  <div class="imp-ai-header">
    <div class="imp-ai-icon">
      <ion-icon name="sparkles-outline"></ion-icon>
    </div>
    <div class="imp-ai-header-text">
      <span class="imp-ai-title">Generate a CSV with AI</span>
      <span class="imp-ai-subtitle">Copy this prompt into ChatGPT, Claude, or any AI</span>
    </div>
  </div>

  <!-- Steps -->
  <div class="imp-steps">
    <div class="imp-step" [class.imp-step--done]="promptCopied()">
      @if (promptCopied()) {
        <div class="imp-step-num imp-step-num--done">
          <ion-icon name="checkmark-outline"></ion-icon>
        </div>
        <span class="imp-step-lbl imp-step-lbl--done">Copied!</span>
      } @else {
        <div class="imp-step-num">1</div>
        <span class="imp-step-lbl">Copy prompt below</span>
      }
    </div>
    <ion-icon name="chevron-forward-outline" class="imp-step-arrow"></ion-icon>
    <div class="imp-step">
      <div class="imp-step-num">2</div>
      <span class="imp-step-lbl">Paste into AI with your words</span>
    </div>
    <ion-icon name="chevron-forward-outline" class="imp-step-arrow"></ion-icon>
    <div class="imp-step">
      <div class="imp-step-num">3</div>
      <span class="imp-step-lbl">Upload the CSV here</span>
    </div>
  </div>

  <!-- Prompt card -->
  <div class="imp-prompt-card" [class.imp-prompt-card--copied]="promptCopied()">
    <div class="imp-prompt-top">
      @if (promptCopied()) {
        <span class="imp-prompt-label imp-prompt-label--copied">✓ Copied to clipboard</span>
      } @else {
        <span class="imp-prompt-label">AI prompt</span>
      }
      <button class="imp-copy-btn" [class.imp-copy-btn--copied]="promptCopied()" (click)="copyPrompt()">
        @if (promptCopied()) {
          <ion-icon name="checkmark-outline"></ion-icon>
          Copied!
        } @else {
          <ion-icon name="copy-outline"></ion-icon>
          Copy
        }
      </button>
    </div>
    <div class="imp-prompt-body">
      <pre class="imp-prompt-text">{{ DISPLAY_PROMPT }}</pre>
    </div>
    <div class="imp-prompt-footer">
      <ion-icon name="information-circle-outline"></ion-icon>
      <span class="imp-prompt-footer-text">
        @if (promptCopied()) {
          Now open your favourite AI tool, paste the prompt, add your words, and download the CSV
        } @else {
          Works with ChatGPT, Claude, Gemini, Copilot — any AI that generates text
        }
      </span>
    </div>
  </div>
</div>
```

#### Component logic

```typescript
import { CLIPBOARD_PROMPT, DISPLAY_PROMPT } from './import-prompt.constants';

readonly promptCopied = signal(false);
readonly DISPLAY_PROMPT = DISPLAY_PROMPT;

async copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(CLIPBOARD_PROMPT);
    this.promptCopied.set(true);
    this.showToast('Prompt copied to clipboard');

    // Reset after 8 seconds
    setTimeout(() => this.promptCopied.set(false), 8_000);
  } catch {
    // Fallback for older browsers / permissions
    this.fallbackCopy(CLIPBOARD_PROMPT);
  }
}

private fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  this.promptCopied.set(true);
  this.showToast('Prompt copied to clipboard');
  setTimeout(() => this.promptCopied.set(false), 8_000);
}
```

#### Acceptance criteria

- [ ] AI prompt section renders below the compact drop zone
- [ ] 3-step visual guide (Copy → Paste → Upload) is visible
- [ ] Tapping "Copy" copies the full `CLIPBOARD_PROMPT` to the system clipboard
- [ ] Copy button + step 1 transition to "Copied!" state
- [ ] Prompt card border changes to success green on copy
- [ ] Footer text updates to post-copy guidance
- [ ] State resets after 8 seconds
- [ ] Clipboard fallback works on iOS Safari (where `navigator.clipboard` may need permissions)
- [ ] All styles use LDS tokens; no raw hex/px
- [ ] `addIcons` updated for `sparklesOutline`, `chevronForwardOutline`, `copyOutline`, `informationCircleOutline`

---

### LC-348 · Remove format spec, demote template to secondary link

**Phase:** 1 — UI
**Points:** 2
**Depends on:** LC-347

#### User story

As a user, I no longer see a confusing CSV column specification on the import page, and the
download template option is presented as a subtle secondary link rather than a prominent
button.

#### Files to modify

| File | Change |
|---|---|
| `import.page.html` | Remove `.imp-format-box` section entirely; replace `.imp-dl-btn` and `.imp-browse-btn` with a single `.imp-template-link` row |
| `import.page.scss` | Remove `.imp-format-box`, `.imp-format-title`, `.imp-format-row`, `.imp-format-note` classes; add `.imp-template-link` |

#### Template — template link (replacing both old buttons)

```html
<!-- Template download (secondary) -->
<button class="imp-template-link" (click)="downloadTemplate()">
  <ion-icon name="download-outline"></ion-icon>
  <div class="imp-template-text">
    <span class="imp-template-title">Download CSV template</span>
    <span class="imp-template-sub">95 pre-made words — try it out</span>
  </div>
  <ion-icon name="chevron-forward-outline" class="imp-template-chevron"></ion-icon>
</button>
```

#### SCSS — new template link

```scss
.imp-template-link {
  display: flex; align-items: center; gap: t.$lc-space-2;
  padding: t.$lc-space-2 t.$lc-space-3;
  background: var(--lc-surface); border: 1px solid var(--lc-border);
  border-radius: t.$lc-radius-sm + 2; cursor: pointer; width: 100%;
  transition: background var(--lc-transition-fast);
  font-family: t.$lc-font-body;
  ion-icon { font-size: 18px; color: var(--lc-brand-mid); }
  &:active { background: var(--lc-brand-light); }
}

.imp-template-text { flex: 1; }
.imp-template-title { @include u.lc-font('sm', t.$lc-font-weight-semibold); color: var(--lc-text-primary); display: block; }
.imp-template-sub { @include u.lc-font('xs'); color: var(--lc-text-hint); display: block; margin-top: 1px; }
.imp-template-chevron { font-size: 14px !important; color: var(--lc-text-hint) !important; }
```

#### Elements removed

- The entire `<div class="imp-format-box">` and all its children
- The `<button class="imp-dl-btn">` (full-width green button)
- The `<button class="imp-browse-btn">` (full-width outlined button — browse is now in the compact drop zone)
- The "or start with our template" divider

#### Acceptance criteria

- [ ] Format spec box is completely removed from the template
- [ ] No `.imp-format-*` classes remain in SCSS
- [ ] Template download appears as a compact list-item row, not a prominent button
- [ ] Browse functionality is only in the compact drop zone (no duplicate button)
- [ ] `downloadTemplate()` logic is unchanged
- [ ] All "or" dividers are removed (the page uses spatial grouping instead)

---

## Phase 2 — Polish

### LC-349 · Copy confirmation state + toast feedback

**Phase:** 2 — Polish
**Points:** 2
**Depends on:** LC-347

#### User story

As a user who tapped "Copy", I want clear visual confirmation (green border, checkmark icon,
toast notification) so I know the prompt is on my clipboard and I can switch to another app.

#### Files to modify

| File | Change |
|---|---|
| `import.page.scss` | Add `.imp-prompt-card--copied`, `.imp-copy-btn--copied`, `.imp-step--done`, `.imp-step-num--done`, `.imp-step-lbl--done` modifier styles |

#### SCSS — modifier classes

```scss
.imp-prompt-card--copied { border-color: var(--lc-mastery-5); }

.imp-prompt-top {
  // Add transition for background color change
  transition: background var(--lc-transition-fast);
}
.imp-prompt-card--copied .imp-prompt-top {
  background: #D1FAE5; border-color: var(--lc-mastery-5);
}
.imp-prompt-label--copied { color: var(--lc-mastery-5) !important; }

.imp-copy-btn--copied { background: var(--lc-mastery-5) !important; }

.imp-step--done {
  background: var(--lc-brand-light); border-color: var(--lc-brand);
}
.imp-step-num--done {
  background: var(--lc-mastery-5);
  ion-icon { font-size: 11px; }
}
.imp-step-lbl--done { color: var(--lc-brand); font-weight: t.$lc-font-weight-semibold; }
```

#### Acceptance criteria

- [ ] Prompt card border turns green (`--lc-mastery-5`) after copy
- [ ] Prompt card header background turns light green
- [ ] "Copy" button turns green with checkmark
- [ ] Step 1 shows "✓ Copied!" with green indicator
- [ ] Toast "Prompt copied to clipboard" appears at bottom
- [ ] All visual states reset after 8 seconds
- [ ] Transitions are smooth (no flashing)

---

### LC-350 · Prompt constants file + display/clipboard versions

**Phase:** 2 — Polish
**Points:** 2
**Depends on:** LC-347

#### User story

As a developer, I want the prompt text to live in a separate constants file (not inline in
the template), so future prompt changes are easy and the component stays clean.

#### Files to create

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/pages/import/import-prompt.constants.ts` | New — exports `CLIPBOARD_PROMPT` and `DISPLAY_PROMPT` |

#### Implementation

```typescript
/**
 * The full prompt copied to the user's clipboard.
 * Includes rules and examples for maximum AI output quality.
 * Aligned with CsvParserService's expected column layout (indices 0–6).
 */
export const CLIPBOARD_PROMPT = `I have a list of German words I want to study. Create a CSV file with these exact column headers:

front,back,article,plural,category,exampleTarget,exampleNative

Column definitions:
- front: English translation (e.g. "dog")
- back: German word WITHOUT article (e.g. "Hund")
- article: der, die, or das — leave empty for verbs, adjectives, phrases
- plural: Full plural with article (e.g. "die Hunde") — leave empty for verbs
- category: One of: Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
- exampleTarget: A natural German sentence using the word
- exampleNative: English translation of that sentence

Rules:
- The "back" column must NEVER include the article — that goes in the "article" column only
- Wrap any field that contains commas in double quotes
- Include the header row as the first line
- Use correct German grammar in all sentences

Here are my German words:
[PASTE YOUR WORDS HERE — one per line]

Output ONLY the CSV with headers. No markdown fences. No explanations.`;

/**
 * Abbreviated prompt shown in the UI card for scannability.
 * The clipboard version (above) is what actually gets copied.
 */
export const DISPLAY_PROMPT = `Create German vocabulary flashcards as a CSV.

Columns: front,back,article,plural,category,exampleTarget,exampleNative

• front = English translation
• back = German word (no article)
• article = der/die/das or empty
• plural = full form (e.g. die Hunde)
• category = Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
• exampleTarget = German sentence with the word
• exampleNative = English translation of the sentence

[PASTE YOUR WORDS HERE]

Output ONLY the CSV. No explanations.`;

/**
 * Category list shared between the prompt and the parser.
 * Matches the CATEGORIES array in word-enrich-prompt.builder.ts.
 */
export const IMPORT_CATEGORIES = [
  'Food', 'Travel', 'Home', 'Work', 'People',
  'Nature', 'Transport', 'Shopping', 'Health', 'Other',
] as const;
```

#### Acceptance criteria

- [ ] `import-prompt.constants.ts` exports `CLIPBOARD_PROMPT`, `DISPLAY_PROMPT`, and `IMPORT_CATEGORIES`
- [ ] `import.page.ts` imports from the constants file — no inline prompt strings
- [ ] Category list in the prompt matches `CATEGORIES` in `word-enrich-prompt.builder.ts`
- [ ] Column names in the prompt match `CsvParserService` column indices exactly
- [ ] `tsc --noEmit` passes

---

## Phase 3 — Future: Paste Words

> **Note:** Phase 3 can be deferred. It's documented here as a forward-looking design that
> reuses the existing enrichment pipeline to eliminate CSV friction entirely.

### LC-351 · Paste Words entry page (text input → enrichment)

**Phase:** 3 — Future
**Points:** 5
**Depends on:** LC-346 (method cards UI — adds a third "Paste" card)

#### User story

As a user, I want to type or paste a list of German words directly in the app, so I can
import vocabulary without creating or uploading a file.

#### Files to create

| File | Change |
|---|---|
| `apps/mobile/src/app/features/vault/import/pages/paste-import/paste-import.page.ts` | New page |
| `apps/mobile/src/app/features/vault/import/pages/paste-import/paste-import.page.html` | New template |
| `apps/mobile/src/app/features/vault/import/pages/paste-import/paste-import.page.scss` | New styles |
| Routing file | Add `/vault/import/paste` route |

#### UX

- Text area for pasting/typing German words (one per line)
- Live word count as user types
- "Generate N flashcards" button (disabled when empty)
- On submit: convert lines to `RawExtractedWord[]`, call enrichment endpoint, navigate to
  image-import review page (same review flow as image import)

#### Architecture

```typescript
// Convert pasted text to RawExtractedWord[] for the enrichment endpoint
const rawWords: RawExtractedWord[] = text
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => ({
    back: line,
    article: null,
    rawText: line,
  }));
```

This reuses the **existing** enrichment pipeline: `POST /import/enrich` → `WordEnrichService`
→ `WordEnrichPromptBuilder`. The review page (`/vault/import/image/review`) already handles
`ImageExtractedWord[]` results. No new backend work needed.

#### Acceptance criteria

- [ ] Page renders at `/vault/import/paste`
- [ ] Text area accepts multiline input
- [ ] Word count updates as user types
- [ ] Empty lines and whitespace are filtered out
- [ ] "Generate N flashcards" button shows correct count
- [ ] Button disabled when word count is 0
- [ ] All styles use LDS tokens

---

### LC-352 · Wire Paste Words to enrichment endpoint + review flow

**Phase:** 3 — Future
**Points:** 5
**Depends on:** LC-351

#### User story

As a user who pasted German words, I want the app to automatically generate full flashcards
(with translations, articles, plurals, examples, and synonyms), so I only need to type the
German words — the app does the rest.

#### Files to modify

| File | Change |
|---|---|
| `paste-import.page.ts` | Add `submitWords()` — calls enrichment API, navigates to review |
| `import.page.html` | Add third method card for "Paste" when feature flag is enabled |
| `import.page.ts` | Add `navigateToPasteImport()` method |

#### Implementation

```typescript
async submitWords(): Promise<void> {
  const rawWords = this.parseInput();
  if (rawWords.length === 0) return;

  this.isProcessing.set(true);

  // Navigate to processing screen (reuse image-processing page)
  this.imageImportState.setRawWords(rawWords);
  this.router.navigate(['/vault/import/image/processing']);
}
```

The existing image-import processing page already handles:
1. Calling `POST /import/enrich` with `RawExtractedWord[]`
2. Showing batch progress (10 words at a time)
3. Handling partial results (rate limit)
4. Navigating to review page on completion

#### Method card addition

```html
<!-- Third method card (Paste) — shown when available -->
<button class="imp-method-card" (click)="navigateToPasteImport()">
  <div class="imp-method-icon imp-method-icon--paste">
    <ion-icon name="clipboard-outline"></ion-icon>
  </div>
  <span class="imp-method-title">Paste Words</span>
  <span class="imp-method-sub">Type or paste a list</span>
</button>
```

#### Acceptance criteria

- [ ] Pasted words are sent to enrichment endpoint as `RawExtractedWord[]`
- [ ] Processing screen shows batch progress (reuses image-processing page)
- [ ] On success, review page shows enriched words with articles, translations, examples
- [ ] User can select/deselect words and pick a collection (reuses image-import review)
- [ ] Partial results (rate limit) are handled gracefully
- [ ] Import method card row expands to three cards without layout issues

---

## Architecture Decision Records

### ADR-1: Exclude synonym columns from the AI prompt

**Context:** The full CSV schema supports 15 synonym columns (3 synonyms × 5 fields each).
Including these in the user-facing AI prompt would make it very long and complex.

**Decision:** The AI prompt generates only the 7 core columns. Synonyms are handled by
server-side enrichment (LC-131 / LC-132) on import, which produces higher-quality synonyms
anyway.

**Consequence:** Users importing via AI-generated CSV get synonyms automatically through the
enrichment pipeline. The prompt stays short and reliable across different AI tools.

### ADR-2: Two prompt versions (display vs clipboard)

**Context:** The prompt card in the UI needs to be scannable (short), but the clipboard
version needs to be detailed (with rules and examples) for maximum AI output quality.

**Decision:** Maintain two versions in `import-prompt.constants.ts`. The display version is
~120 words; the clipboard version is ~200 words with explicit rules.

**Consequence:** The UI stays clean while the actual prompt produces better CSV output. Both
versions reference the same column names and categories to avoid drift.

### ADR-3: Paste Words reuses the enrichment pipeline

**Context:** The "Paste Words" feature (LC-351/LC-352) needs to convert plain text into full
flashcards. We could build a new pipeline or reuse the existing `WordEnrichService`.

**Decision:** Reuse the existing enrichment endpoint (`POST /import/enrich`). The paste input
is converted to `RawExtractedWord[]` — the same type the image import uses. The processing
page, review page, and card creation logic are all reused unchanged.

**Consequence:** ~10 story points instead of ~25+. No new backend work for Phase 3. The
Paste Words feature is primarily a new entry page + navigation wiring.

---

## Non-goals

- **New CSV parser** — the existing `CsvParserService` already handles the 7 core columns + synonyms. No changes needed.
- **Server-side prompt endpoint** — the prompt is a static string, no reason to serve it from the API.
- **Prompt customisation** — users cannot edit the prompt in-app. They can modify it after copying.
- **In-app CSV preview** — showing a preview of AI-generated CSV before upload. The existing import-review page already handles this.
- **Dark mode for prompt card** — follows the existing dark mode token override pattern (`body.ion-palette-dark`). No special handling needed since all styles use CSS custom properties.
