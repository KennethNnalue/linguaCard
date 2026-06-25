# Claude Code Prompt — Vault "Lexicon" Redesign (LinguaCard)

Copy-paste this entire prompt into Claude Code to start the implementation.

---

## Task
Implement a full visual + UX redesign of the **Vault** feature in the LinguaCard Angular/Ionic app, in a new premium identity called **Lexicon**. The design is specified in `README.md` (this folder) and demonstrated interactively in `Vault.html` (open it in a browser first; `Vault.dc.html` is the editable source with exact markup, logic and sample data).

**Core UX change:** retire the Words/Collections tab toggle. The Vault becomes a single scroll: a **focus hero** (due count + review CTA) → **All Words** index card → **Collections** as first-class shelves. Drill-down: Vault → collection or All-Words → word.

## Codebase context
- **Framework:** Angular 17+ standalone components, Ionic 7, NgRx Signal Store, `@ngx-translate` (use existing i18n keys — no hardcoded English).
- **Feature root:** `apps/mobile/src/app/features/vault/`.
- **Tokens:** `src/theme/_tokens.scss`. Add a scoped **Lexicon** token block (see README) under a `// ─── VAULT (LEXICON) ───` heading — do NOT change the app-wide brand palette.
- **Shared component:** reuse `<lc-article-badge>` and the speed-dial FAB pattern (`SpeedDialFabComponent`).

## Step 1 — Read the spec
Read `README.md` in full (every screen: layout, colors with token names, type, radii, shadows, interactions, store mappings). Open `Vault.html` and click through Home → Word Index → Collection Detail → Word Detail, plus the Add-word, Import and FAB speed-dial sheets.

## Step 2 — Fonts & tokens
1. Add **Spectral**, **Hanken Grotesk** and **Spline Sans Mono** to the app's Google Fonts loading. Add SCSS vars `$lc-vx-font-display: 'Spectral'`, `$lc-vx-font-body: 'Hanken Grotesk'`, `$lc-vx-font-mono: 'Spline Sans Mono'`.
2. Add the Lexicon color/mastery/article/gradient tokens from the README to `_tokens.scss` (scoped names, e.g. `$lc-vx-*`).

## Step 3 — Vault home (`pages/vault/vault.page.html` + `.scss` + `.ts`)
- Remove the `<ion-segment>`/tab-rail toggle and the always-present action bar.
- Build: focus hero (bind due total + `computed()` mastery distribution), All-Words card (→ word index state), collections list (cover gradient + urgency due badge + mastery meter), speed-dial FAB.
- Default `activeTab`/view = the unified library (no "collections" default-tab bug).
- Reuse `openAddWord()`, `openCreateCollection()`, `openImportSheet()`, `openCollectionDetail()`, review/listen entry points.

## Step 4 — Word Index (all-words state of vault.page)
Search field + filter chips with mono count badges (All/Due/New/Mastered) + premium word rows (mastery strip, article badge, Spectral headword, DUE pill / mastery label). Use existing `onSearch()`, `setMasteryFilter()`, and the `cards()`/count computeds.

## Step 5 — Collection Detail (`pages/collection-detail`)
Cover-gradient hero + overlapping stats card (Words / Due / Mastered%) + Review/Listen + category chips + word rows + add-word FAB. Back-nav returns to the Vault (not the retired standalone collections page).

## Step 6 — Word Detail (`pages/word-detail`)
Editorial layout: big Spectral headword + article + phonetic; Listen button; mastery ring + 4-stat grid; example sentences with brass left-rule + italic English; note tile; related words. Keep the existing Rate/Edit/Delete bottom bar.

## Step 7 — Sheets
Restyle `add-word-sheet` (mono labels, gender-tinted article segmented, Auto-fill, collection/category, example) and the import entry (CSV / photo / paste) to match. Slide-up `.3s cubic-bezier(.2,.8,.2,1)`.

## Step 8 — Retire the orphaned Collections page
Per the prior epic (LC-202): redirect `/vault/collections` → the Vault; point `collection-detail` back-nav + delete-confirm to the Vault; delete/deprecate `pages/collections`.

## Step 9 — Verify
1. `/vault` looks like `Vault.html`. 2. All drill-downs and back-nav work. 3. Add/Import/FAB sheets present correctly. 4. `ng test` passes. 5. `ng build --configuration production` is clean.

## Constraints
- Use **i18n keys**, not hardcoded strings. Use **`$lc-vx-*` / `$lc-*` SCSS vars**, not raw hex. Keep `<lc-article-badge>`. Prefer `computed()` over new store state — the data the templates need already exists in `CardStore` / `CollectionStore`.
