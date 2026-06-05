# Epic: Vault UX Redesign — Updated
**Epic ID:** LC-200  
**Status:** 🔄 In Progress — partially implemented  
**Feature:** `features/vault/`  
**Priority:** High  
**Updated:** June 2026 — post-codebase investigation

---

## Investigation summary

The codebase has moved significantly since the original epic was written. Several stories are already shipped or partially complete. The table below is the ground-truth status from reading the live source.

| Story | Original status | **Actual state** |
|---|---|---|
| LC-201 — Tab rail (Words / Collections) | Planned | ✅ **Done** |
| LC-202 — Retire orphaned Collections page | Planned | ❌ **Not started — still fully live** |
| LC-203 — Contextual action bar | Planned | ❌ **Not started + active bug found** |
| LC-204 — Speed-dial FAB | Planned | ❌ **Not started** |
| LC-205 — Collection card urgency strips | Planned | 🔶 **Partially done** |
| LC-206 — Collection detail contextual FAB | Planned | ✅ **Done** (openAddWord exists) |
| LC-207 — Filter chips with count badges | Planned | 🔶 **Partially done** |
| LC-208 — Design polish pass | Planned | ❌ **Not started** |
| **NEW: LC-209 — Fix wrong default tab** | — | 🐛 **Bug: defaults to collections** |
| **NEW: LC-210 — Sync vault.page collection cards with collections.page** | — | ⚠️ **Two sources of truth** |

---

## Detailed findings

### ✅ LC-201 — Tab rail: DONE

`vault.page.html` uses `<ion-segment>` with `"All words"` and `"Collections"` tabs. The `activeTab` signal drives `@if` blocks. The segment is styled as an iOS pill control via `.vault-segment`. Nothing to do here.

---

### ❌ LC-202 — Retire orphaned Collections page: NOT STARTED

This is the most impactful remaining item and nothing has changed since the original epic.

**What still exists:**
- `/vault/collections` route is registered in `app.routes.ts` loading `CollectionsPage`
- `collection-detail.page.ts` `goBack()` hardcodes `this.router.navigate(['/vault/collections'])`
- `confirmDelete()` inside collection-detail also navigates to `'/vault/collections'`
- `CollectionsPage` is a full standalone component with its own toolbar, "My Collections" title, back button, hero banner, and collection list — duplicating the vault's Collections tab entirely

**Impact:** The user sees two different collection list UIs. Back navigation from a collection detail goes to the orphaned page, not the vault. Delete confirmation also breaks out to the orphaned page.

---

### ❌ LC-203 — Contextual action bar: NOT STARTED + Active bug

**What still exists:**
- Header: `vault-icon-btn` (cloud-upload icon, no label) + `vault-fab` (+ icon, no label)
- Both buttons are always shown regardless of active tab

**Active bug found:** The `vault-fab` (+ button) calls `openAddWord()` on **both** tabs. When the user is on the Collections tab, tapping + opens the Add Word sheet — not Create Collection. There is no `openCreateCollection()` method on `VaultPage` at all. The only way to create a collection from VaultPage is indirectly: add a word and then create one inside the `AssignCollectionSheetComponent`.

---

### 🔶 LC-205 — Collection card urgency strips: PARTIALLY DONE

**What's implemented:**
- `col-progress-bar` + `col-progress-fill` with `[style.width.%]="progressPercent(col)"` — ✅
- `col-due-badge--amber` (N due) + `col-due-badge--green` (✓ up to date) — ✅
- `progressPercent()` method computing `masteredCount / cardCount * 100` — ✅
- `col-incomplete-dot` amber indicator for `importStatus === 'incomplete'` — ✅ **but only on `collections.page.html`, not on `vault.page.html`'s collection cards**

**What's missing:**
- The left-border urgency strip (red ≥50% due, amber ≥20%) — ❌
- A `dueRatio` computed signal for the threshold logic — ❌
- The incomplete dot is absent from `vault.page.html`'s collection card loop — ❌ (two sources of truth; see LC-210)

---

### 🔶 LC-207 — Filter chips with count badges: PARTIALLY DONE

**What's implemented:**
- Four chips: All, Due now, New, Mastered — ✅
- "All" chip shows `totalCount()` badge — ✅
- `dueCount` computed signal exists in `vault.page.ts` — ✅

**What's missing:**
- `dueCount` is **never rendered** in the "Due now" chip; the chip just says "Due now" with no number — ❌
- No count badge on "New" or "Mastered" chips — ❌
- The epic's red-tinted badge styling for the Due count is absent — ❌

---

### 🐛 LC-209 (NEW) — Wrong default tab

`vault.page.ts` initialises `activeTab` as `'collections'` not `'words'`:

```typescript
readonly activeTab = signal<'words' | 'collections'>('collections');
```

Every time a user taps the Vault bottom nav tab they land on the Collections view, not the All Words list. This is counter-intuitive — the primary purpose of the Vault is word management, not collection browsing. This needs a one-line fix but it was introduced during the partial implementation and was never caught.

---

### ⚠️ LC-210 (NEW) — Two sources of truth for collection card rendering

The Collections tab inside `vault.page.html` renders collection cards with a simpler template than `collections.page.html`. Specifically:

| Feature | `vault.page.html` col-cards | `collections.page.html` col-cards |
|---|---|---|
| Due badge (amber/green) | ✅ | ✅ |
| Progress bar + % | ✅ | ✅ |
| Incomplete dot (amber) | ❌ missing | ✅ present |
| Description truncation | ✅ | ✅ |
| `col-card--incomplete` border | ❌ missing | ✅ present |

When LC-202 is completed (orphaned page retired), `vault.page.html` becomes the **only** place collection cards render. It must be brought to feature parity with the richer `collections.page.html` version before the orphaned page is removed.

---

## Remaining work — revised stories

### LC-202 · Retire the orphaned Collections page
**Size:** M | **Priority:** 🔴 Highest

**What to change:**

1. **`collection-detail.page.ts`** — change both navigation calls:
   ```typescript
   // goBack()
   this.router.navigate(['/vault'], { queryParams: { tab: 'collections' } });

   // confirmDelete() handler
   this.router.navigate(['/vault'], { queryParams: { tab: 'collections' } });
   ```

2. **`vault.page.ts`** — read `tab` query param on init and apply it:
   ```typescript
   constructor() {
     const tab = inject(ActivatedRoute).snapshot.queryParams['tab'];
     if (tab === 'collections') this.activeTab.set('collections');
   }
   ```
   Import `ActivatedRoute` from `@angular/router`.

3. **`app.routes.ts`** — replace the dedicated collections route with a redirect:
   ```typescript
   // REMOVE:
   { path: 'vault/collections', loadComponent: () => import('./features/vault/pages/collections/collections.page') }
   
   // ADD:
   { path: 'vault/collections', redirectTo: '/vault?tab=collections', pathMatch: 'full' }
   ```

4. **`collections.page.ts` / `collections.page.html` / `collections.page.scss`** — mark for deletion (or keep as dead code temporarily if you want a fallback). Add a `// TODO: delete after LC-202 ships` comment.

**Acceptance criteria:**
- [ ] Tapping Back from any collection detail lands on Vault with Collections tab active
- [ ] Delete collection confirmation also lands on Vault Collections tab
- [ ] Navigating to `/vault/collections` (e.g., from a bookmark or deep link) redirects to `/vault?tab=collections`
- [ ] No console errors for the removed route
- [ ] `CollectionsPage` is either deleted or clearly flagged as unused

---

### LC-203 · Fix the header actions — contextual + labelled
**Size:** M | **Priority:** 🔴 High (includes active bug fix)

**Bug fix first — Collections tab FAB creates a word instead of a collection:**

Add `openCreateCollection()` to `VaultPage` using the same pattern as `CollectionsPage.openCreateSheet()`:

```typescript
// vault.page.ts — new imports needed:
// AssignCollectionSheetComponent from '../../components/assign-collection-sheet/...'

async openCreateCollection(): Promise<void> {
  const modal = await this.modalCtrl.create({
    component: AssignCollectionSheetComponent,
    breakpoints: [0, 0.6, 0.85],
    initialBreakpoint: 0.6,
    handleBehavior: 'cycle',
    componentProps: { autoConfirmOnCreate: true },
  });
  await modal.present();
  const { data } = await modal.onWillDismiss();
  this.collectionStore.loadCollections();
  if (data?.collectionId) {
    await this._promptImportAfterCreate(data.collectionId);
  }
}

private async _promptImportAfterCreate(collectionId: string): Promise<void> {
  const sheet = await this.actionSheetCtrl.create({
    header: 'Add words to your collection?',
    buttons: [
      { text: 'Import from CSV', icon: 'cloud-upload-outline', handler: () => this.router.navigate(['/vault/import']) },
      { text: 'Import from image', icon: 'camera-outline', handler: () => this.router.navigate(['/vault/import/image']) },
      { text: 'Go to collection', handler: () => this.router.navigate(['/vault/collections', collectionId]) },
      { text: 'Maybe later', role: 'cancel' },
    ],
  });
  await sheet.present();
}
```

**Header redesign — replace static icon buttons with contextual row:**

In `vault.page.html`, replace the `vault-nav-actions` div content with a tab-sensitive structure:

```html
<!-- vault.page.html — new header actions -->
<div class="vault-nav-actions">
  @if (activeTab() === 'words') {
    <button class="vault-action-btn vault-action-btn--primary" (click)="openAddWord()">
      <ion-icon name="add-outline"></ion-icon>
      Add Card
    </button>
    <button class="vault-action-btn vault-action-btn--secondary" (click)="openImportSheet()">
      <ion-icon name="cloud-upload-outline"></ion-icon>
      Import
    </button>
  }
  @if (activeTab() === 'collections') {
    <button class="vault-action-btn vault-action-btn--primary" (click)="openCreateCollection()">
      <ion-icon name="add-outline"></ion-icon>
      New Collection
    </button>
    <button class="vault-action-btn vault-action-btn--icon" (click)="openImportSheet()">
      <ion-icon name="ellipsis-vertical-outline"></ion-icon>
    </button>
  }
</div>
```

Add `openImportSheet()` that presents an action sheet:
```typescript
async openImportSheet(): Promise<void> {
  const sheet = await this.actionSheetCtrl.create({
    header: 'Import words',
    buttons: [
      { text: 'Import from CSV', icon: 'document-text-outline', handler: () => this.router.navigate(['/vault/import']) },
      { text: 'Import from image', icon: 'camera-outline', handler: () => this.router.navigate(['/vault/import/image']) },
      { text: 'Cancel', role: 'cancel' },
    ],
  });
  await sheet.present();
}
```

Add to `addIcons()` in constructor: `cameraOutline, ellipsisVerticalOutline, documentTextOutline`.

**SCSS — new `.vault-action-btn` styles:**
```scss
.vault-action-btn {
  display: flex;
  align-items: center;
  gap: t.$lc-space-1 + 2px;
  padding: 7px 13px;
  border-radius: t.$lc-radius-sm + 2px;
  @include u.lc-font('xs', t.$lc-font-weight-semibold);
  font-family: t.$lc-font-body;
  border: none;
  cursor: pointer;
  ion-icon { font-size: t.$lc-text-md; }

  &--primary {
    background: var(--lc-accent);
    color: white;
    box-shadow: 0 2px 8px rgba(224, 123, 63, 0.32);
  }
  &--secondary {
    background: var(--lc-brand-light);
    color: var(--lc-brand);
    border: 1px solid rgba(45, 90, 78, 0.2);
  }
  &--icon {
    @include u.square(34px);
    border-radius: t.$lc-radius-full;
    background: var(--lc-surface);
    border: 1px solid var(--lc-border);
    justify-content: center;
    padding: 0;
  }
}
```

Remove the old `.vault-icon-btn` and `.vault-fab` styles (or leave them for now and override).

**Acceptance criteria:**
- [ ] On Words tab: header shows labelled "Add Card" (accent) + "Import" (secondary) buttons
- [ ] On Collections tab: header shows labelled "New Collection" (accent) + ⋯ overflow icon button
- [ ] Tapping "Add Card" opens `AddWordSheetComponent` (as before)
- [ ] Tapping "New Collection" opens `AssignCollectionSheetComponent` and offers import follow-up
- [ ] Import overflow shows action sheet with CSV + image options
- [ ] Old unlabelled icon buttons are gone

---

### LC-205 (remaining) · Urgency strip on collection cards
**Size:** S | **Priority:** 🟡 Medium

Only the left-border urgency strip is missing. Progress bar and due badge already exist.

**Changes to `vault.page.html`** — inside the `@for (col of collections()` loop, bind a dynamic border class:

```html
<div
  class="col-card"
  [class.col-card--empty]="col.cardCount === 0"
  [class.col-card--urgency-high]="urgencyLevel(col) === 'high'"
  [class.col-card--urgency-medium]="urgencyLevel(col) === 'medium'"
  (click)="openCollectionDetail(col)">
```

**Add `urgencyLevel()` to `vault.page.ts`:**
```typescript
urgencyLevel(col: Collection): 'high' | 'medium' | 'none' {
  if (!col.cardCount) return 'none';
  const ratio = (col.dueCount ?? 0) / col.cardCount;
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.2) return 'medium';
  return 'none';
}
```

**Add SCSS for urgency border in `vault.page.scss`:**
```scss
.col-card {
  // existing styles remain
  border-left: 3px solid transparent; // reserve the space — no layout shift
  
  &--urgency-high   { border-left-color: #EF4444; }
  &--urgency-medium { border-left-color: #F59E0B; }
}
```

**Acceptance criteria:**
- [ ] Collection cards with ≥50% cards due show a red 3px left border
- [ ] Collection cards with ≥20% and <50% due show an amber 3px left border
- [ ] Up-to-date collections have no visible left border
- [ ] Border does not cause layout shift (reserved via transparent default)

---

### LC-207 (remaining) · Count badges on Due/New/Mastered filter chips
**Size:** S | **Priority:** 🟡 Medium

Only the badge on "Due now" is missing. The `dueCount` signal already exists.

**Add computed counts to `vault.page.ts`:**
```typescript
// These already exist or are trivial to add:
readonly newCount = computed(() =>
  this.cardStore.cards().filter(c => !c.srsState || c.srsState.state === 'new').length
);
readonly masteredCount = computed(() =>
  this.cardStore.cards().filter(c => c.srsState?.state === 'mastered').length
);
// dueCount already exists
```

**Update `vault.page.html` filter chips:**
```html
<button class="v2-filter-chip" [class.v2-filter-on]="masteryFilter() === 'due'" ... (click)="setMasteryFilter('due')">
  Due now <span class="v2-filter-count v2-filter-count--urgent">{{ dueCount() }}</span>
</button>
<button class="v2-filter-chip" [class.v2-filter-on]="masteryFilter() === 'new'" ... (click)="setMasteryFilter('new')">
  New <span class="v2-filter-count">{{ newCount() }}</span>
</button>
<button class="v2-filter-chip" [class.v2-filter-on]="masteryFilter() === 'mastered'" ... (click)="setMasteryFilter('mastered')">
  Mastered <span class="v2-filter-count">{{ masteredCount() }}</span>
</button>
```

**Add to `vault.page.scss`:**
```scss
.v2-filter-count {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: t.$lc-radius-full;
  background: rgba(0, 0, 0, 0.1);
  margin-left: 3px;
  
  .v2-filter-on & {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }
  
  &--urgent {
    background: #FEF2F2;
    color: #B91C1C;
    .v2-filter-on & {
      background: rgba(255, 255, 255, 0.25);
      color: white;
    }
  }
}
```

**Acceptance criteria:**
- [ ] "Due now" chip shows count; count has red-tinted badge when filter is inactive
- [ ] "New" chip shows count
- [ ] "Mastered" chip shows count
- [ ] All badge counts update reactively when cards are added/reviewed
- [ ] When the chip is active (green background), badge turns white-tinted

---

### LC-209 (NEW) · Fix wrong default tab
**Size:** XS | **Priority:** 🔴 High (UX regression)

**One-line fix in `vault.page.ts`:**
```typescript
// Change:
readonly activeTab = signal<'words' | 'collections'>('collections');

// To:
readonly activeTab = signal<'words' | 'collections'>('words');
```

This should have been `'words'` from day one. The Vault is primarily a word list; collections are secondary navigation.

**Acceptance criteria:**
- [ ] Tapping the Vault tab in the bottom nav always lands on "All words"
- [ ] LC-202's query-param mechanism (`?tab=collections`) still overrides this on back-navigation from collection detail

---

### LC-210 (NEW) · Sync vault.page collection cards with collections.page before retiring
**Size:** S | **Priority:** 🔴 Must complete before LC-202

The collection card loop inside `vault.page.html` is missing two features that `collections.page.html` already has. These must be added before the orphaned page is retired, otherwise those features silently regress.

**Add to `vault.page.html` collections `@for` loop:**

```html
<!-- Inside the col-card-name-row — add incomplete dot: -->
<div class="col-card-name-row">
  <span class="col-card-emoji">{{ col.emoji }}</span>
  <span class="col-card-name">{{ col.name }}</span>
  @if (col.importStatus === 'incomplete') {
    <span class="col-incomplete-dot" [title]="col.pendingWords.length + ' cards pending'"></span>
  }
</div>

<!-- Add col-card--incomplete class binding: -->
<div
  class="col-card"
  [class.col-card--incomplete]="col.importStatus === 'incomplete'"
  ...>
```

**Add missing styles to `vault.page.scss`:**
```scss
.col-incomplete-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lc-warning, #F0B429);
  flex-shrink: 0;
  margin-left: 4px;
  align-self: center;
}

.col-card {
  // existing...
  &--incomplete {
    border-color: var(--lc-warn-border, #FCD34D);
  }
}
```

**Acceptance criteria:**
- [ ] Incomplete collections show amber dot in the vault's Collections tab (same as collections.page)
- [ ] Incomplete collections get the amber border modifier (same as collections.page)
- [ ] Feature-parity confirmed: side-by-side audit of vault.page vs collections.page collection cards — no functional differences

---

### LC-204 · Speed-dial FAB
**Size:** M | **Priority:** 🟢 Low (nice-to-have, post-LC-203)

The contextual action bar (LC-203) provides labelled primary actions in the header. The speed-dial FAB is a secondary power-user enhancement. Defer until LC-202 and LC-203 are shipped and stable.

When implemented, `SpeedDialFabComponent` goes in `shared/components/speed-dial-fab/`. The vault page wraps it but does not own the component logic.

---

### LC-208 · Design polish pass
**Size:** M | **Priority:** 🟢 Low

After the functional stories above are complete, audit the vault for LDS token compliance. Key things to check:

- Replace any raw px values in vault SCSS with `t.$lc-space-*` tokens
- Verify `vault-segment` styling matches LDS pill control spec
- Add `box-shadow: t.$lc-shadow-fab` to the new primary action button
- Confirm `col-card` uses `@include u.lc-card()` mixin

---

## Revised story dependency order

```
LC-209 (fix default tab)   ← 1 line, ship immediately
     ↓
LC-210 (sync col-cards)    ← prerequisite for LC-202
     ↓
LC-202 (retire orphan page)   ← fixes back-nav; depends on LC-210
     ↓
LC-203 (contextual action bar + bug fix)  ← fixes FAB bug; can ship in parallel with LC-202
     ↓
LC-205 remaining (urgency strip)   ← visual polish
LC-207 remaining (filter badges)   ← visual polish
     ↓
LC-204 (speed-dial FAB)     ← post-stabilisation
LC-208 (design polish)      ← post-stabilisation
```

---

## Files touched by remaining work

| File | Stories |
|---|---|
| `apps/mobile/src/app/app.routes.ts` | LC-202 |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.ts` | LC-203, LC-207, LC-209, LC-202 |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.html` | LC-203, LC-205, LC-207, LC-210 |
| `apps/mobile/src/app/features/vault/pages/vault/vault.page.scss` | LC-203, LC-205, LC-207, LC-210 |
| `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.ts` | LC-202 |
| `apps/mobile/src/app/features/vault/pages/collections/collections.page.ts` | LC-202 (delete/deprecate) |
| `apps/mobile/src/app/features/vault/pages/collections/collections.page.html` | LC-202 (delete/deprecate) |
| `apps/mobile/src/app/features/vault/pages/collections/collections.page.scss` | LC-202 (delete/deprecate) |

No store changes are needed for any remaining story. All logic lives at the component layer.

---

## Non-goals (unchanged)

- Changing the SRS algorithm or review flow
- Redesigning the word detail page
- Changing the import CSV/image pipeline internals
- Backend changes of any kind

---

## CLAUDE.md update required

When LC-202 ships, update the **Implemented page inventory** entry:

```
# Remove:
Vault: vault list, word detail, collections, collection detail, ...

# Replace with:
Vault: vault list (Words + Collections tabs), word detail, collection detail,
       add-word sheet, assign-collection sheet, category selector,
       CSV import, image import (in progress)
       NOTE: /vault/collections route is a redirect — CollectionsPage is retired
```
