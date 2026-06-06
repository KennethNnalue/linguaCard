# Epic: LinguaCard Design System (LDS)

**Epic ID:** LC-DS  
**Status:** Planning  
**Goal:** Establish a single source of truth for all visual and interaction decisions in the LinguaCard mobile app — replacing scattered inline values, inconsistent component patterns, and copy-pasted SCSS with a formal Design System that every feature uses.

---

## Current state — what's wrong today

| Problem | Where it shows up | Impact |
|---|---|---|
| Hardcoded pixel values everywhere | `font-size: 11px`, `padding: 14px 16px`, `border-radius: 13px` in dozens of component `.scss` files | Any spacing change needs a grep-and-replace across 20+ files |
| Colours referenced by raw hex in component SCSS | `background: #FEF2F2`, `color: #B91C1C` | Dark mode support is impossible without touching every file |
| CSS variables exist in `variables.scss` but are not enforced | Tokens like `--lc-brand` are defined but components still use raw values alongside them | The token layer has no actual authority |
| No reusable component library | `article-badge`, `mastery-dot`, `word-item`, `fab-button`, `cat-chip` patterns are copy-pasted across features rather than extracted | Bugs and visual drift: same pattern looks different in Review vs Vault |
| Ionic overrides are scattered | Ionic CSS variable overrides live in `variables.scss` but also inside individual component files | Hard to track what is overriding what |
| No Claude skill enforcing the system | Claude (used for ongoing development) has no structured reference for the design system rules | Each AI-assisted feature risks drifting from the system |
| Two font imports with no governance | `Inter` imported in `global.scss`, `Lora`/`DM Sans`/`Fira Code` imported in `index.html` — no single source of truth | Inconsistent font fallbacks and potential double-load |
| No spacing scale enforcement | Spacing is ad hoc: 4px, 6px, 8px, 9px, 10px, 11px, 12px, 13px, 14px all used as one-offs | No rhythm, no consistency |

---

## Goals

1. **Single token source** — All colour, spacing, typography, radius, shadow, animation, and z-index values live in one place (`apps/mobile/src/theme/`).
2. **Reusable component library** — Every pattern used in more than one place is an Angular standalone component in `shared/ui/`.
3. **Dark mode ready** — All tokens have light and dark values; components never use raw values.
4. **Ionic harmony** — Ionic's CSS custom properties are mapped to LDS tokens, not overridden with raw values.
5. **Claude skill** — A `.claude/skills/lds.md` file gives Claude precise, enforceable rules for every UI decision.
6. **Zero migration surprise** — Every story has explicit files to create, files to modify, and acceptance criteria so the work can be reviewed and merged incrementally.

---

## Phasing

| Phase | Theme | Stories | Effort |
|---|---|---|---|
| 1 — Foundation | Token layer and SCSS infrastructure | DS-01 → DS-03 | ~3 days |
| 2 — Core components | Extract the most-used shared patterns | DS-04 → DS-09 | ~5 days |
| 3 — Feature migration | Apply the system to all feature SCSS files | DS-10 → DS-15 | ~6 days |
| 4 — Dark mode | Wire tokens to Ionic dark class | DS-16 | ~2 days |
| 5 — Claude skill | Codify the system into a `.claude` skill | DS-17 | ~1 day |

---

---

# Phase 1 — Foundation

---

## DS-01 · Design token SCSS file

**Phase:** 1 — Foundation  
**Points:** 2  
**Depends on:** Nothing  

### User story

As a developer, I want all design decisions to live in one SCSS partial so that I never have to guess what value to use for a colour, spacing step, or radius.

### What to build

Create `apps/mobile/src/theme/_tokens.scss`. This file defines **every** token as a SCSS variable. It is the single source of truth — components import from here; `variables.scss` maps these to CSS custom properties for runtime use.

**File structure to create:**

```
apps/mobile/src/theme/
├── _tokens.scss          ← NEW: all raw token values as SCSS vars
├── _dark.scss            ← NEW: dark mode overrides (Phase 4)
├── variables.scss        ← MODIFY: now just maps tokens → CSS custom props
└── _ionic-map.scss       ← NEW: maps Ionic CSS vars to LDS tokens
```

### `_tokens.scss` content

```scss
// ─── BRAND PALETTE ──────────────────────────────────────────────────────────
$lc-brand:           #2D5A4E;
$lc-brand-light:     #E8F2EE;
$lc-brand-mid:       #4A8C7A;
$lc-brand-dark:      #1A3830;
$lc-accent:          #E07B3F;
$lc-accent-light:    #FDF0E6;
$lc-accent-dark:     #B55E28;

// ─── ARTICLE GENDER COLOURS ─────────────────────────────────────────────────
$lc-masc-bg:         #EAF2FC;
$lc-masc-text:       #1A56A3;
$lc-masc-border:     #85B7EB;
$lc-fem-bg:          #FEF2F2;
$lc-fem-text:        #B91C1C;
$lc-fem-border:      #FCA5A5;
$lc-neut-bg:         #F1EFE8;
$lc-neut-text:       #5F5E5A;
$lc-neut-border:     #B4B2A9;

// ─── MASTERY COLOURS ────────────────────────────────────────────────────────
$lc-mastery-0:       #D1D5DB;
$lc-mastery-1:       #FCA5A5;
$lc-mastery-2:       #FCD34D;
$lc-mastery-3:       #6EE7B7;
$lc-mastery-4:       #34D399;
$lc-mastery-5:       #059669;

// ─── SURFACES ───────────────────────────────────────────────────────────────
$lc-surface:         #FAFAF8;
$lc-card:            #FFFFFF;
$lc-border:          rgba(45, 90, 78, 0.12);
$lc-border-strong:   rgba(45, 90, 78, 0.24);

// ─── TEXT ───────────────────────────────────────────────────────────────────
$lc-text-primary:    #1A2B26;
$lc-text-secondary:  #6B7C78;
$lc-text-hint:       #9BAAA6;
$lc-text-inverse:    #FFFFFF;

// ─── SPACING SCALE (base 4px) ───────────────────────────────────────────────
$lc-space-1:  4px;
$lc-space-2:  8px;
$lc-space-3:  12px;
$lc-space-4:  16px;
$lc-space-5:  20px;
$lc-space-6:  24px;
$lc-space-8:  32px;
$lc-space-10: 40px;
$lc-space-12: 48px;
$lc-space-16: 64px;

// ─── BORDER RADIUS ──────────────────────────────────────────────────────────
$lc-radius-sm:   8px;
$lc-radius-md:   12px;
$lc-radius-lg:   20px;
$lc-radius-xl:   28px;
$lc-radius-full: 9999px;

// ─── SHADOWS ────────────────────────────────────────────────────────────────
$lc-shadow-card:  0 2px 12px rgba(45, 90, 78, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
$lc-shadow-float: 0 8px 32px rgba(45, 90, 78, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
$lc-shadow-fab:   0 4px 16px rgba(224, 123, 63, 0.40);
$lc-shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.15);

// ─── TYPOGRAPHY ─────────────────────────────────────────────────────────────
$lc-font-display: 'Lora', Georgia, serif;
$lc-font-body:    'DM Sans', system-ui, sans-serif;
$lc-font-mono:    'Fira Code', 'Courier New', monospace;

$lc-font-weight-regular:   400;
$lc-font-weight-medium:    500;
$lc-font-weight-semibold:  600;
$lc-font-weight-bold:      700;
$lc-font-weight-extrabold: 800;

// Text size steps
$lc-text-xxs: 0.625rem; // 10px
$lc-text-xs:  0.6875rem; // 11px
$lc-text-sm:  0.8125rem; // 13px
$lc-text-md:  0.875rem;  // 14px
$lc-text-lg:  0.9375rem; // 15px
$lc-text-xl:  1rem;      // 16px
$lc-text-2xl: 1.125rem;  // 18px
$lc-text-3xl: 1.25rem;   // 20px
$lc-text-4xl: 1.5rem;    // 24px

// ─── ANIMATION ──────────────────────────────────────────────────────────────
$lc-duration-fast:   150ms;
$lc-duration-base:   250ms;
$lc-duration-slow:   350ms;
$lc-duration-flip:   300ms;
$lc-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
$lc-easing-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);

// ─── Z-INDEX SCALE ──────────────────────────────────────────────────────────
$lc-z-base:    0;
$lc-z-raised:  10;
$lc-z-fab:     100;
$lc-z-header:  200;
$lc-z-drawer:  300;
$lc-z-modal:   400;
$lc-z-toast:   500;
```

### Modifications to `variables.scss`

Replace the current inline `:root {}` block. Instead, `variables.scss` should `@use 'tokens'` and map every SCSS variable to a CSS custom property:

```scss
@use 'tokens' as t;

:root {
  // Brand
  --lc-brand:         #{t.$lc-brand};
  --lc-brand-light:   #{t.$lc-brand-light};
  // ... (all tokens mapped)

  // Spacing
  --lc-space-1: #{t.$lc-space-1};
  // ... etc.

  // Transitions (convenience shorthand)
  --lc-transition-fast: #{t.$lc-duration-fast} #{t.$lc-easing-standard};
  --lc-transition-base: #{t.$lc-duration-base} #{t.$lc-easing-standard};
}
```

### Acceptance criteria

- [ ] `_tokens.scss` exists at `apps/mobile/src/theme/_tokens.scss`
- [ ] Every current CSS custom property in `variables.scss` is driven by a token from `_tokens.scss`
- [ ] No raw hex or pixel value exists in `variables.scss` itself — all values reference SCSS variables
- [ ] `ionic serve` compiles without error
- [ ] Visual output is pixel-identical to before the change (this story is pure refactor)

---

## DS-02 · Ionic CSS variable mapping

**Phase:** 1 — Foundation  
**Points:** 2  
**Depends on:** DS-01  

### User story

As a developer, I want Ionic's theming layer to be driven by LDS tokens so that changing a brand colour in one place updates both our custom components and all Ionic components simultaneously.

### What to build

Create `apps/mobile/src/theme/_ionic-map.scss`. This file maps Ionic's own CSS custom properties to LDS CSS custom properties. It should be imported in `variables.scss` after the `:root {}` block.

```scss
// apps/mobile/src/theme/_ionic-map.scss
// Maps Ionic CSS variables → LDS design tokens.
// Never set raw values here — always reference --lc-* vars.

:root {
  // Ionic colours → LDS brand
  --ion-color-primary:           var(--lc-brand);
  --ion-color-primary-shade:     var(--lc-brand-dark);
  --ion-color-primary-tint:      var(--lc-brand-mid);

  // Backgrounds
  --ion-background-color:        var(--lc-surface);
  --ion-item-background:         var(--lc-card);
  --ion-card-background:         var(--lc-card);

  // Text
  --ion-text-color:              var(--lc-text-primary);
  --ion-color-step-150:          var(--lc-text-hint);
  --ion-color-step-350:          var(--lc-text-secondary);
  --ion-color-step-600:          var(--lc-text-primary);

  // Tab bar
  --ion-tab-bar-background:      var(--lc-card);
  --ion-tab-bar-border-color:    var(--lc-border);
  --ion-tab-bar-color:           var(--lc-text-hint);
  --ion-tab-bar-color-selected:  var(--lc-brand);

  // Toolbar
  --ion-toolbar-background:      var(--lc-card);
  --ion-toolbar-border-color:    var(--lc-border);

  // Border radius
  --ion-border-radius:           var(--lc-radius-md);

  // Font
  --ion-font-family:             var(--lc-font-body);
}
```

### Files to modify

| File | Change |
|---|---|
| `apps/mobile/src/theme/variables.scss` | Add `@use '_ionic-map'` after the `:root {}` block |
| `apps/mobile/src/global.scss` | Remove any `--ion-*` overrides that are now in `_ionic-map.scss` |

### Acceptance criteria

- [ ] `_ionic-map.scss` exists
- [ ] `ion-tab-bar`, `ion-toolbar`, and `ion-card` visually match the LDS brand colours
- [ ] No raw `--ion-*` overrides exist outside `_ionic-map.scss`
- [ ] Dark mode class (`.dark`) on `<body>` causes Ionic surfaces to flip correctly (verified in browser)

---

## DS-03 · SCSS utility mixins

**Phase:** 1 — Foundation  
**Points:** 1  
**Depends on:** DS-01  

### User story

As a developer, I want a small set of utility mixins so that common SCSS patterns (flex centering, text truncation, responsive breakpoints) don't get copy-pasted.

### What to build

Create `apps/mobile/src/theme/_utils.scss`:

```scss
// apps/mobile/src/theme/_utils.scss
@use 'tokens' as t;

// ─── FLEX ────────────────────────────────────────────────────────────────────
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

// ─── TEXT TRUNCATION ────────────────────────────────────────────────────────
@mixin text-overflow {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

// ─── GEOMETRY ───────────────────────────────────────────────────────────────
@mixin square($size) {
  width: $size;
  height: $size;
  flex-shrink: 0;
}

@mixin circle($size) {
  @include square($size);
  border-radius: 50%;
}

// ─── TYPOGRAPHY SHORTHAND ───────────────────────────────────────────────────
// Usage: @include lc-font(sm, 600);
@mixin lc-font($size-key, $weight: t.$lc-font-weight-regular) {
  $sizes: (
    'xxs': t.$lc-text-xxs,
    'xs':  t.$lc-text-xs,
    'sm':  t.$lc-text-sm,
    'md':  t.$lc-text-md,
    'lg':  t.$lc-text-lg,
    'xl':  t.$lc-text-xl,
    '2xl': t.$lc-text-2xl,
    '3xl': t.$lc-text-3xl,
    '4xl': t.$lc-text-4xl,
  );
  font-size: map-get($sizes, $size-key);
  font-weight: $weight;
}

// ─── CARD SURFACE ────────────────────────────────────────────────────────────
@mixin lc-card($radius: t.$lc-radius-md) {
  background: var(--lc-card);
  border: 1px solid var(--lc-border);
  border-radius: $radius;
  box-shadow: var(--lc-shadow-card);
}

// ─── TOUCH STATE ────────────────────────────────────────────────────────────
@mixin touch-state {
  &:active {
    opacity: 0.82;
    transform: scale(0.97);
    transition: opacity t.$lc-duration-fast, transform t.$lc-duration-fast;
  }
}
```

### How to use in components

```scss
// In any component .scss
@use '../../../theme/tokens' as t;
@use '../../../theme/utils' as u;

.my-card {
  @include u.lc-card(t.$lc-radius-lg);
  padding: t.$lc-space-4;
}
```

### Acceptance criteria

- [ ] `_utils.scss` exists at `apps/mobile/src/theme/_utils.scss`
- [ ] All mixins are documented with a usage example comment
- [ ] At least two existing component SCSS files are refactored to use the mixins as a smoke test

---

---

# Phase 2 — Core Components

---

## DS-04 · `<lc-article-badge>` component

**Phase:** 2 — Core components  
**Points:** 2  
**Depends on:** DS-01  

### User story

As a developer working on any feature that shows German words, I want a single `<lc-article-badge>` component so that the article colour system is applied consistently everywhere and I never have to copy the CSS.

### Current state

The article badge CSS is defined in `variables.scss` as `.lc-article-badge`, `.lc-article-badge--der`, etc., and applied as raw class strings in templates. There is no Angular component encapsulating this.

### What to build

**Files to create:**

```
apps/mobile/src/app/shared/ui/article-badge/
├── article-badge.component.ts
├── article-badge.component.html
└── article-badge.component.scss
```

```typescript
// article-badge.component.ts
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { ArticleType } from '../../../core/models/mock-data';

@Component({
  selector: 'lc-article-badge',
  standalone: true,
  templateUrl: './article-badge.component.html',
  styleUrl: './article-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleBadgeComponent {
  article = input.required<ArticleType>();
}
```

```html
<!-- article-badge.component.html -->
@if (article()) {
  <span class="badge" [class]="'badge--' + article()">
    {{ article() }}
  </span>
}
```

```scss
// article-badge.component.scss
@use '../../../../theme/tokens' as t;

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: t.$lc-font-body;
  font-size: t.$lc-text-xxs;
  font-weight: t.$lc-font-weight-bold;
  letter-spacing: 0.04em;
  padding: 2px t.$lc-space-2;
  border-radius: t.$lc-radius-full;
  border: 1px solid transparent;
  white-space: nowrap;

  &--der { background: t.$lc-masc-bg; color: t.$lc-masc-text; border-color: t.$lc-masc-border; }
  &--die { background: t.$lc-fem-bg;  color: t.$lc-fem-text;  border-color: t.$lc-fem-border; }
  &--das { background: t.$lc-neut-bg; color: t.$lc-neut-text; border-color: t.$lc-neut-border; }
}
```

### Files to modify

Replace all template usages of `class="lc-article-badge lc-article-badge--der"` patterns with `<lc-article-badge [article]="card.article" />`.

Known locations:
- `vault/pages/vault/` word list rows
- `vault/pages/word-detail/`
- `review/pages/review/` flashcard faces
- `shared/components/word-item/`

### Acceptance criteria

- [ ] Component exists, is standalone, uses `ChangeDetectionStrategy.OnPush`
- [ ] Renders nothing when `article` is `null` (verbs/adjectives)
- [ ] All four states (`der`, `die`, `das`, null) render correctly
- [ ] No raw article colour hex values exist outside `_tokens.scss` and this component
- [ ] All previous usages of the `.lc-article-badge--*` class pattern are replaced with the component

---

## DS-05 · `<lc-mastery-dot>` component

**Phase:** 2 — Core components  
**Points:** 1  
**Depends on:** DS-01  

### User story

As a developer, I want a `<lc-mastery-dot>` component so that mastery level is visualised consistently across the vault, review summary, and progress screens.

### What to build

```
apps/mobile/src/app/shared/ui/mastery-dot/
├── mastery-dot.component.ts
├── mastery-dot.component.html
└── mastery-dot.component.scss
```

```typescript
import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { MasteryLevel } from '../../../core/models/mock-data';

@Component({
  selector: 'lc-mastery-dot',
  standalone: true,
  template: `<span class="dot" [class]="'dot--' + level()"></span>`,
  styleUrl: './mastery-dot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MasteryDotComponent {
  level = input.required<MasteryLevel>();
}
```

SCSS uses `_tokens.scss` mastery colour variables, no raw hex.

### Acceptance criteria

- [ ] Renders a coloured dot for all 6 mastery levels (0–5)
- [ ] Uses token variables, no hardcoded colours
- [ ] All `.lc-mastery-dot--*` class usages replaced with the component

---

## DS-06 · `<lc-word-item>` component

**Phase:** 2 — Core components  
**Points:** 3  
**Depends on:** DS-04, DS-05  

### User story

As a developer, I want a `<lc-word-item>` row component so that the word list row pattern is defined once and used identically in the vault list, review summary, and search results.

### Current state

The `.lc-word-item` CSS pattern is defined in `variables.scss` (global) and implemented inline in several feature templates. The layout varies slightly between usages, causing inconsistency.

### What to build

```
apps/mobile/src/app/shared/ui/word-item/
├── word-item.component.ts
├── word-item.component.html
└── word-item.component.scss
```

**Inputs:**
- `card: input<Card>()` — the word data
- `showMastery: input(true)` — whether to show the mastery dot
- `showAudio: input(false)` — whether to show the audio play button
- `interactive: input(true)` — whether to show active/hover state

**Template:**
```html
<div class="item" [class.item--interactive]="interactive()">
  <lc-mastery-dot [level]="card().srsState?.masteryLevel ?? 0" />
  <div class="item-content">
    <div class="item-front">
      <lc-article-badge [article]="card().article" />
      <span class="front-text">{{ card().front }}</span>
    </div>
    <div class="item-back">{{ card().back }}</div>
  </div>
  @if (showAudio()) {
    <lc-audio-play-button [text]="card().front" />
  }
</div>
```

### Acceptance criteria

- [ ] Component renders with correct layout for all input combinations
- [ ] `interactive` input applies touch state via `@include u.touch-state()`
- [ ] Uses `lc-article-badge` and `lc-mastery-dot` internally — no duplicate logic
- [ ] Feature templates in vault and review are updated to use `<lc-word-item>`

---

## DS-07 · `<lc-button>` component

**Phase:** 2 — Core components  
**Points:** 3  
**Depends on:** DS-01  

### User story

As a developer, I want a single `<lc-button>` component that wraps all button variants so that I never write `<button class="imp-upload-btn">` or `<button class="pss-cta">` again.

### Current state

Every feature defines its own CTA button style. At least 8 different button CSS classes exist across the codebase, all implementing the same visual pattern with slight differences:
- `imp-upload-btn`, `imp-browse-btn` (import page)
- `pss-cta` (playlist source sheet)
- `gs-generate-btn` (generate story sheet)
- Raw `<button>` with inline style in several other pages

### What to build

```
apps/mobile/src/app/shared/ui/button/
├── button.component.ts
├── button.component.html
└── button.component.scss
```

**Variants:** `filled-primary` | `filled-accent` | `outline-primary` | `ghost-primary` | `destructive`

**Sizes:** `sm` | `md` | `lg`

```typescript
@Component({
  selector: 'lc-button',
  standalone: true,
  // ...
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  variant = input<'filled-primary' | 'filled-accent' | 'outline-primary' | 'ghost-primary' | 'destructive'>('filled-primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  disabled = input(false);
  loading = input(false);
  fullWidth = input(false);
}
```

SCSS uses only token variables. The `.lc-button--filled-primary` variant maps `background` to `t.$lc-brand`, etc.

### Files to modify

All feature button styles that implement a primary CTA should be replaced with `<lc-button>`. The feature-specific button class names are deleted.

### Acceptance criteria

- [ ] All 5 variants render correctly in light mode
- [ ] `loading` input shows a spinner and disables interaction
- [ ] `disabled` input applies reduced opacity and removes pointer events
- [ ] `fullWidth` input sets `width: 100%`
- [ ] `@include u.touch-state()` is applied
- [ ] At minimum: import page, generate story sheet, and playlist source sheet CTAs are migrated

---

## DS-08 · `<lc-category-chip>` component

**Phase:** 2 — Core components  
**Points:** 2  
**Depends on:** DS-01  

### User story

As a developer, I want a `<lc-category-chip>` component so that the filter chip pattern used in the vault, review hub, and listen pages looks and behaves identically.

### Current state

The `.lc-cat-chip` CSS is defined globally in `variables.scss`, but the markup differs slightly between the vault page (uses click handler), review hub, and listen page. Interactive state inconsistencies exist.

### What to build

```
apps/mobile/src/app/shared/ui/category-chip/
├── category-chip.component.ts
├── category-chip.component.html
└── category-chip.component.scss
```

**Inputs:** `label: string`, `count?: number`, `active: boolean`  
**Outputs:** `chipClick: void`

### Acceptance criteria

- [ ] Active state (`active = true`) shows brand background + white text
- [ ] Inactive state shows card background + secondary text
- [ ] Count displays in a lighter weight when provided
- [ ] All cat-chip usages in vault, review hub, and listen are replaced

---

## DS-09 · `<lc-empty-state>` component

**Phase:** 2 — Core components  
**Points:** 1  
**Depends on:** DS-01  

### User story

As a developer, I want an `<lc-empty-state>` component so that every "nothing here yet" screen looks consistent.

### Current state

The empty state pattern (icon, title, subtitle, optional CTA) is implemented differently in vault, stories, and review hub. They share the same visual intent but have inconsistent spacing and typography choices.

### What to build

```
apps/mobile/src/app/shared/ui/empty-state/
├── empty-state.component.ts
└── empty-state.component.html  (uses ng-content for CTA slot)
```

**Inputs:** `icon: string`, `title: string`, `subtitle: string`  
**Content projection:** `<ng-content select="[action]">` for optional CTA button

### Acceptance criteria

- [ ] Renders icon (emoji), title, subtitle, and optional action slot
- [ ] Spacing uses token variables only
- [ ] At least vault, stories library, and review hub empty states are migrated

---

---

# Phase 3 — Feature Migration

---

## DS-10 · Migrate `home` feature SCSS to tokens

**Phase:** 3 — Feature migration  
**Points:** 2  
**Depends on:** DS-01, DS-03  

### User story

As a developer, I want the home feature's styles to use only token variables and utility mixins so that the home screen respects the design system.

### Files to migrate

| File | What to change |
|---|---|
| `features/home/pages/home/home.page.scss` | Replace all raw `px`, hex, and font values with token imports |

### Migration rules (apply to all Phase 3 stories)

1. Add `@use '../../../../theme/tokens' as t;` and `@use '../../../../theme/utils' as u;` at the top
2. Replace every `font-size: <px>` with `@include u.lc-font('<key>')`
3. Replace every `padding`/`margin`/`gap` raw px value with the nearest `t.$lc-space-*`
4. Replace every `border-radius` raw px value with the nearest `t.$lc-radius-*`
5. Replace every `color: #hex` with the appropriate `t.$lc-*` variable
6. Replace every `background: #hex` with the appropriate `t.$lc-*` variable
7. Replace every `box-shadow` with the appropriate `t.$lc-shadow-*`
8. Delete the local class if it duplicates a global utility class

### Acceptance criteria

- [ ] No raw hex colour values in the file
- [ ] No raw `px` values for `font-size`, `padding`, `margin`, `gap`, `border-radius`
- [ ] No raw `box-shadow` values
- [ ] Visual output is pixel-identical (screenshots compared before/after)

---

## DS-11 · Migrate `vault` feature SCSS to tokens

**Phase:** 3 — Feature migration  
**Points:** 3  
**Depends on:** DS-01, DS-03, DS-04, DS-05, DS-06  

### Files to migrate

- `features/vault/pages/vault/vault.page.scss`
- `features/vault/pages/word-detail/word-detail.page.scss`
- `features/vault/pages/collections/collections.page.scss`
- `features/vault/pages/collection-detail/collection-detail.page.scss`
- `features/vault/components/add-word-sheet/add-word-sheet.component.scss`
- `features/vault/components/add-word-sheet/add-word-sheet.fields.scss`
- `features/vault/components/assign-collection-sheet/assign-collection-sheet.component.scss`

Apply the same migration rules as DS-10.

### Acceptance criteria

Same as DS-10, applied to all 7 files above.

---

## DS-12 · Migrate `review` feature SCSS to tokens

**Phase:** 3 — Feature migration  
**Points:** 3  
**Depends on:** DS-01, DS-03, DS-05  

### Files to migrate

- `features/review/pages/review/review.page.scss`
- `features/review/pages/review-hub/review-hub.page.scss`
- `features/review/pages/session-summary/session-summary.page.scss`
- `features/review/pages/custom-study/custom-study.page.scss`

Apply the same migration rules as DS-10.

---

## DS-13 · Migrate `listen` feature SCSS to tokens

**Phase:** 3 — Feature migration  
**Points:** 2  
**Depends on:** DS-01, DS-03  

### Files to migrate

- `features/listen/pages/listen/listen.page.scss`
- `features/listen/components/playlist-source-sheet/playlist-source-sheet.component.scss`

Apply the same migration rules as DS-10.

---

## DS-14 · Migrate `stories` feature SCSS to tokens

**Phase:** 3 — Feature migration  
**Points:** 2  
**Depends on:** DS-01, DS-03  

### Files to migrate

- `features/stories/pages/story-library/story-library.page.scss`
- `features/stories/pages/story-reader/story-reader.page.scss`
- `features/stories/pages/story-complete/story-complete.page.scss`
- `features/stories/components/generate-story-sheet/generate-story-sheet.component.scss`

Apply the same migration rules as DS-10.

---

## DS-15 · Migrate `import` sub-feature and shared components SCSS

**Phase:** 3 — Feature migration  
**Points:** 2  
**Depends on:** DS-01, DS-03, DS-07  

### Files to migrate

- `features/vault/import/pages/import/import.page.scss`
- `features/vault/import/pages/import-review/import-review.page.scss`
- `shared/components/user-menu/user-menu.component.scss`
- `shared/components/fab-button/fab-button.component.scss`

Apply the same migration rules as DS-10.

---

---

# Phase 4 — Dark Mode

---

## DS-16 · Dark mode token layer

**Phase:** 4 — Dark mode  
**Points:** 3  
**Depends on:** DS-01 through DS-15  

### User story

As a user, I want the app to switch to a dark theme that uses the system preference or a manual toggle, with all colours drawn from the design token layer.

### Current state

`variables.scss` imports `dark.class.css` from Ionic which applies dark mode when `.dark` is on `<body>`. However, the actual surface and text colours are not overridden in dark mode — Ionic's defaults are used, which conflict with the LDS brand colours.

### What to build

Create `apps/mobile/src/theme/_dark.scss`:

```scss
// _dark.scss
// Overrides for all LDS CSS custom properties under .dark body.
.dark {
  --lc-surface:       #0F1A16;
  --lc-card:          #1A2B26;
  --lc-border:        rgba(255, 255, 255, 0.08);
  --lc-border-strong: rgba(255, 255, 255, 0.16);

  --lc-text-primary:   #EDF2F0;
  --lc-text-secondary: #8AADA5;
  --lc-text-hint:      #5C7A73;
  --lc-text-inverse:   #1A2B26;

  // Brand stays constant in dark mode
  --lc-brand:       #2D5A4E;
  --lc-brand-light: rgba(45, 90, 78, 0.18);
  --lc-brand-mid:   #4A8C7A;
}
```

Import `_dark.scss` in `variables.scss` after the `_ionic-map.scss` import.

**`ThemeService`** (already exists) applies `.dark` to `document.body` based on user preference. No changes needed to the service logic — only the token overrides need to be added.

### Acceptance criteria

- [ ] `_dark.scss` exists with dark overrides for all surface, text, and border tokens
- [ ] Toggling dark mode in the user menu switches all screens correctly
- [ ] Brand green accent remains legible in dark mode
- [ ] Article gender colours remain legible (they have sufficient contrast on dark surfaces by design)
- [ ] Mastery dots remain legible
- [ ] No Ionic component shows the wrong background colour in dark mode

---

---

# Phase 5 — Claude Skill

---

## DS-17 · LinguaCard Design System Claude skill

**Phase:** 5 — Claude skill  
**Points:** 2  
**Depends on:** DS-01 through DS-16  

### User story

As a developer using Claude for ongoing feature development, I want a Claude skill file that encodes all LDS rules so that every AI-assisted feature automatically follows the design system without needing manual reminders.

### What to build

Create `.claude/skills/lds.md` in the project root. This file becomes the authoritative reference Claude consults before writing any UI code.

**See the companion file `lds-skill.md` for the full skill content.**

The skill must cover:

1. **Token import pattern** — how to `@use 'tokens'` and reference variables
2. **SCSS hard rules** — the no-raw-values checklist
3. **Component catalogue** — every shared/ui component with its selector, inputs, and usage example
4. **Ionic integration rules** — what is allowed and what is forbidden
5. **Naming conventions** — flat class names, no BEM, no feature-prefix leakage
6. **New component checklist** — steps to follow when creating any new Angular component
7. **Dark mode rules** — why you never set background or color values directly

### Acceptance criteria

- [ ] File exists at `.claude/skills/lds.md`
- [ ] Skill is referenced in `CLAUDE.md` under a "Design System" section
- [ ] A smoke test: ask Claude to create a new feature page and verify it uses the token imports, the shared components, and produces no raw values

---

---

# Appendix A — Token quick reference (post-refactor)

All values accessed via `@use '../../../../theme/tokens' as t;`

## Spacing

| Variable | Value | Use for |
|---|---|---|
| `t.$lc-space-1` | 4px | Icon gap, badge padding |
| `t.$lc-space-2` | 8px | Chip padding, tight gap |
| `t.$lc-space-3` | 12px | Standard inner padding |
| `t.$lc-space-4` | 16px | Card padding, section gap |
| `t.$lc-space-5` | 20px | Button padding |
| `t.$lc-space-6` | 24px | Page section gap |
| `t.$lc-space-8` | 32px | Large section gap |
| `t.$lc-space-12` | 48px | Empty state padding |

## Radius

| Variable | Value | Use for |
|---|---|---|
| `t.$lc-radius-sm` | 8px | Chips, small tags |
| `t.$lc-radius-md` | 12px | Cards, word rows, inputs |
| `t.$lc-radius-lg` | 20px | Bottom sheets, hero cards |
| `t.$lc-radius-xl` | 28px | Flashcards, large modals |
| `t.$lc-radius-full` | 9999px | Pills, dots, FAB |

## Text sizes

| Variable | Value | Use for |
|---|---|---|
| `t.$lc-text-xxs` | 10px | Labels, article badges, sub-labels |
| `t.$lc-text-xs` | 11px | Category labels, section headers |
| `t.$lc-text-sm` | 13px | Body text, descriptions |
| `t.$lc-text-md` | 14px | Standard body, chip text |
| `t.$lc-text-lg` | 15px | Buttons, list items |
| `t.$lc-text-xl` | 16px | Subheadings |
| `t.$lc-text-2xl` | 18px | Card word (front face) |
| `t.$lc-text-3xl` | 20px | Page titles |
| `t.$lc-text-4xl` | 24px | Hero numbers |

---

# Appendix B — Shared UI component catalogue (post-refactor)

All components live in `apps/mobile/src/app/shared/ui/`. Import from the component's file directly.

| Component | Selector | Inputs | Use for |
|---|---|---|---|
| `ArticleBadgeComponent` | `<lc-article-badge>` | `article: ArticleType` | Der/die/das colour tag |
| `MasteryDotComponent` | `<lc-mastery-dot>` | `level: MasteryLevel` | Mastery level indicator |
| `WordItemComponent` | `<lc-word-item>` | `card`, `showMastery`, `showAudio`, `interactive` | Word list row |
| `ButtonComponent` | `<lc-button>` | `variant`, `size`, `disabled`, `loading`, `fullWidth` | All CTA buttons |
| `CategoryChipComponent` | `<lc-category-chip>` | `label`, `count?`, `active`; Output: `chipClick` | Filter chips |
| `EmptyStateComponent` | `<lc-empty-state>` | `icon`, `title`, `subtitle`; Slot: `[action]` | Empty screens |

---

# Appendix C — Hard rules (enforced by linter and Claude skill)

These are non-negotiable. A PR that violates any of these should not be merged.

1. **No raw hex values** in any `.scss` file except `_tokens.scss`.
2. **No raw `px` values** for `font-size`, `padding`, `margin`, `gap`, or `border-radius` — use token variables.
3. **No raw `box-shadow` values** — use `t.$lc-shadow-*`.
4. **No raw `font-family`** — use `t.$lc-font-display`, `t.$lc-font-body`, or `t.$lc-font-mono`.
5. **No feature-scoped button/CTA CSS** — use `<lc-button>`.
6. **No feature-scoped article colour CSS** — use `<lc-article-badge>`.
7. **No feature-scoped mastery colour CSS** — use `<lc-mastery-dot>`.
8. **No `z-index` values** outside `_tokens.scss`.
9. **No `transition` shorthand** except via `var(--lc-transition-fast)` or `var(--lc-transition-base)`.
10. **No Ionic component override** outside `_ionic-map.scss`.
