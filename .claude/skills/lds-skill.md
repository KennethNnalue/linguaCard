---
name: lds
description: >
  Use the LinguaCard Design System (LDS) whenever writing or editing any UI code
  for the LinguaCard Ionic/Angular app. Activate for component SCSS, feature page
  styles, new shared components, Ionic overrides, or any task involving colour,
  spacing, typography, animation, or z-index. This is the single source of truth
  for all visual decisions.
---

# LinguaCard Design System (LDS)

All UI must be built exclusively using LDS tokens and shared components. Never invent spacing, colour, radius, shadow, or font values — use the tokens defined in `apps/mobile/src/theme/_tokens.scss`.

---

## Import pattern

Every component `.scss` file starts with:

```scss
@use 'theme/tokens' as t;
@use 'theme/utils' as u;
```

Adjust the relative path depth (`../../../../`) to match the file's location. The `t` and `u` aliases are always used — never import individual partials or use a different alias.

---

## SCSS hard rules

These are **non-negotiable**. Violating any of them is a bug.

| Rule                             | Wrong ❌                                        | Right ✅                                 |
|----------------------------------|------------------------------------------------|-----------------------------------------|
| No raw hex colours               | `color: #1A2B26`                               | `color: t.$lc-text-primary`             |
| No raw `px` for spacing          | `padding: 16px 12px`                           | `padding: t.$lc-space-4 t.$lc-space-3`  |
| No raw `px` for radius           | `border-radius: 12px`                          | `border-radius: t.$lc-radius-md`        |
| No raw `px` for font-size        | `font-size: 13px`                              | `@include u.lc-font('sm')`              |
| No raw font families             | `font-family: 'DM Sans'`                       | `font-family: t.$lc-font-body`          |
| No raw box-shadow                | `box-shadow: 0 2px 12px …`                     | `box-shadow: t.$lc-shadow-card`         |
| No raw transitions               | `transition: 150ms ease`                       | `transition: var(--lc-transition-fast)` |
| No raw z-index                   | `z-index: 100`                                 | `z-index: t.$lc-z-fab`                  |
| No Ionic overrides in components | `--ion-toolbar-background: white` in component | Use `_ionic-map.scss` only              |

### CSS class naming

**Do not use BEM**. Angular components are scoped by ViewEncapsulation — flat, descriptive class names are correct.

```scss
// ✅ correct
.header {
  …
}

.title {
  …
}

.word-row {
  …
}

.action-btn {
  …
}

// ❌ wrong — BEM is unnecessary
.word-item__title--active {
  …
}

.card__footer--loading {
  …
}
```

---

## Token reference

### Spacing scale (`t.$lc-space-*`)

| Variable         | Value | Common use                      |
|------------------|-------|---------------------------------|
| `t.$lc-space-1`  | 4px   | Icon gaps, badge padding        |
| `t.$lc-space-2`  | 8px   | Chip padding, tight element gap |
| `t.$lc-space-3`  | 12px  | Standard inner padding          |
| `t.$lc-space-4`  | 16px  | Card padding, section gap       |
| `t.$lc-space-5`  | 20px  | Button vertical padding         |
| `t.$lc-space-6`  | 24px  | Page section spacing            |
| `t.$lc-space-8`  | 32px  | Large section gap               |
| `t.$lc-space-12` | 48px  | Empty state padding             |

### Colours

Text: `t.$lc-text-primary`, `t.$lc-text-secondary`, `t.$lc-text-hint`, `t.$lc-text-inverse`

Surfaces: `t.$lc-surface`, `t.$lc-card`, `t.$lc-border`, `t.$lc-border-strong`

Brand: `t.$lc-brand`, `t.$lc-brand-light`, `t.$lc-brand-mid`, `t.$lc-brand-dark`

Accent: `t.$lc-accent`, `t.$lc-accent-light`, `t.$lc-accent-dark`

Article gender:

- Masculine (der): `t.$lc-masc-bg` / `t.$lc-masc-text` / `t.$lc-masc-border`
- Feminine (die): `t.$lc-fem-bg` / `t.$lc-fem-text` / `t.$lc-fem-border`
- Neuter (das): `t.$lc-neut-bg` / `t.$lc-neut-text` / `t.$lc-neut-border`

Mastery (0–5): `t.$lc-mastery-0` … `t.$lc-mastery-5`

### Border radius

| Variable            | Value  | Use for                   |
|---------------------|--------|---------------------------|
| `t.$lc-radius-sm`   | 8px    | Tags, small chips         |
| `t.$lc-radius-md`   | 12px   | Cards, inputs, list rows  |
| `t.$lc-radius-lg`   | 20px   | Bottom sheets, hero cards |
| `t.$lc-radius-xl`   | 28px   | Flashcards, large modals  |
| `t.$lc-radius-full` | 9999px | Pills, dots, avatar, FAB  |

### Typography

Font families: `t.$lc-font-display` (Lora, serif) · `t.$lc-font-body` (DM Sans) · `t.$lc-font-mono` (Fira Code)

Font weights: `t.$lc-font-weight-regular(400)` · `medium(500)` · `semibold(600)` · `bold(700)` · `extrabold(800)`

**Always use the mixin** instead of `font-size` directly:

```scss
@include u.lc-font('sm'); // 13px, weight 400
@include u.lc-font('md', t.$lc-font-weight-semibold); // 14px, weight 600
```

Available size keys: `xxs(10px)` · `xs(11px)` · `sm(13px)` · `md(14px)` · `lg(15px)` · `xl(16px)` · `2xl(18px)` · `3xl(20px)` · `4xl(24px)`

### Shadows

`t.$lc-shadow-card` — standard card lift  
`t.$lc-shadow-float` — flashcard, FAB, modal  
`t.$lc-shadow-fab` — orange FAB button shadow  
`t.$lc-shadow-modal` — full modal dialogs

### Animation

`var(--lc-transition-fast)` — 150ms standard  
`var(--lc-transition-base)` — 250ms standard  
`t.$lc-duration-flip` — 300ms for flashcard flip

### Z-index scale

`t.$lc-z-base(0)` · `raised(10)` · `fab(100)` · `header(200)` · `drawer(300)` · `modal(400)` · `toast(500)`

---

## Utility mixins (`u.*`)

```scss
// Flexbox shortcuts
@include u.flex-center(); // display:flex; align+justify: center
@include u.flex-between(); // display:flex; align:center; justify:space-between

// Text
@include u.text-overflow(); // single-line truncation with ellipsis

// Geometry
@include u.square(40px); // equal width+height
@include u.circle(40px); // square + border-radius: 50%

// Card surface shorthand
@include u.lc-card(); // default md radius
@include u.lc-card(t.$lc-radius-lg); // custom radius

// Touch state
@include u.touch-state(); // :active → opacity 0.82, scale 0.97
```

---

## Shared UI component catalogue

All components live in `apps/mobile/src/app/shared/ui/`. Import each directly — no barrel NgModule.

### `<lc-article-badge>` — ArticleBadgeComponent

```typescript
import {ArticleBadgeComponent} from '../../../shared/components/article-badge/article-badge.component';
```

```html
<!-- Renders der/die/das badge with correct gender colour. Renders nothing for null. -->
<lc-article-badge [article]="card.article"/>
```

**Never** write your own article colour CSS. **Never** use the old `.lc-article-badge--der` class directly.

---

### `<lc-mastery-dot>` — MasteryDotComponent

```typescript
import {MasteryDotComponent} from '../../../shared/components/mastery-dot/mastery-dot.component';
```

```html

<lc-mastery-dot [level]="card.srsState?.masteryLevel ?? 0"/>
```

**Never** use `.lc-mastery-dot--*` classes directly in feature templates.

---

### `<lc-word-item>` — WordItemComponent

```html

<lc-word-item
  [card]="card"
  [showMastery]="true"
  [showAudio]="false"
  [interactive]="true"
/>
```

Use this for every word row in lists. It internally uses `lc-article-badge` and `lc-mastery-dot`.

---

### `<lc-button>` — ButtonComponent

```html
<!-- Primary CTA -->
<lc-button variant="filled-primary" size="lg" [fullWidth]="true" [loading]="isSubmitting">
  Save word
</lc-button>

<!-- Outline secondary -->
<lc-button variant="outline-primary">Browse files</lc-button>

<!-- Accent (FAB-adjacent) -->
<lc-button variant="filled-accent">Generate story</lc-button>

<!-- Destructive -->
<lc-button variant="destructive" size="sm">Delete</lc-button>
```

**Never** create a feature-specific button CSS class. Every button in the app uses `<lc-button>`.

---

### `<lc-category-chip>` — CategoryChipComponent

```html

<lc-category-chip
  label="Animals"
  [count]="5"
  [active]="selectedCategory === 'animals'"
  (chipClick)="onCategorySelect('animals')"
/>
```

---

### `<lc-empty-state>` — EmptyStateComponent

```html

<lc-empty-state
  icon="📚"
  title="No words yet"
  subtitle="Add your first word to get started."
>
  <lc-button action variant="filled-primary" (click)="openAddSheet()">
    Add a word
  </lc-button>
</lc-empty-state>
```

---

## New component checklist

When creating any new Angular component that has a `.scss` file, follow these steps in order:

1. **Add token imports** at the top:
   ```scss
   @use '../../../../theme/tokens' as t;
   @use '../../../../theme/utils' as u;
   ```
2. **Set `ChangeDetectionStrategy.OnPush`** in the `@Component` decorator — always.
3. **Check the shared/ui catalogue** — does a component already exist for what you're building? If yes, use it.
4. **Write flat class names** — no BEM, no feature-prefix on inner classes (the component selector scopes everything).
5. **Use `input()` signals** not `@Input()` decorators for new components.
6. **Spell-check your token usage** — `t.$lc-space-4` not `16px`.
7. **Touch states** — any tappable element must use `@include u.touch-state()`.

---

## Ionic-specific rules

### What you may do

- Use `<ion-content>`, `<ion-header>`, `<ion-toolbar>`, `<ion-tab-bar>`, `<ion-modal>`, `<ion-action-sheet>`, `<ion-toast>` as structural layout containers.
- Style the **content inside** Ionic containers using LDS classes.
- Use Ionic's `ModalController`, `ActionSheetController`, and `ToastController` for overlays.

### What you must NOT do

- Override `--ion-*` CSS variables in any component stylesheet. All Ionic overrides live in `_ionic-map.scss` only.
- Use Ionic's `ion-button`, `ion-input`, `ion-select`, or `ion-checkbox` for feature UI — use the LDS components instead.
- Set `--ion-background-color` or `--ion-text-color` anywhere in a component.

---

## Dark mode rules

All LDS CSS custom properties have dark mode overrides defined in `_dark.scss`. Dark mode is activated by `.dark` on `<body>` via `ThemeService`.

**Never** set `background`, `color`, or `border-color` with hardcoded values. Always use CSS custom properties (`var(--lc-card)`, `var(--lc-text-primary)`, etc.) so that dark mode overrides apply automatically.

If you use SCSS token variables (e.g. `t.$lc-card`) in a context where you need runtime theming, prefer the CSS custom property (`var(--lc-card)`) instead so dark mode switches without a rebuild.

---

## What the design reference HTML is for

`design-reference.html` (project root) is a living visual spec. It is the ground truth for what screens should look like. Before building a new screen or component, open it and find the corresponding screen or component. Match it exactly. Do not deviate from the visual spec without a deliberate decision.

---

## Examples

### ✅ Correct new component SCSS

```scss
@use '../../../../theme/tokens' as t;
@use '../../../../theme/utils' as u;

:host {
  display: block;
}

.card {
  @include u.lc-card(t.$lc-radius-lg);
  padding: t.$lc-space-4;
  display: flex;
  flex-direction: column;
  gap: t.$lc-space-3;
}

.title {
  @include u.lc-font('xl', t.$lc-font-weight-semibold);
  font-family: t.$lc-font-display;
  color: t.$lc-text-primary;
}

.subtitle {
  @include u.lc-font('sm');
  color: t.$lc-text-secondary;
}

.action {
  @include u.touch-state();
  background: t.$lc-brand;
  color: t.$lc-text-inverse;
  border-radius: t.$lc-radius-md;
  padding: t.$lc-space-4 t.$lc-space-6;
}
```

### ❌ Wrong — every line here breaks a rule

```scss
.card {
  background: #FFFFFF; // ❌ raw hex
  border-radius: 20px; // ❌ raw px
  padding: 16px; // ❌ raw px
  box-shadow: 0 2px 8px #00000020; // ❌ raw shadow
}

.title {
  font-size: 15px; // ❌ raw font-size
  font-family: 'DM Sans'; // ❌ raw font family
  font-weight: 600; // ❌ raw weight (use t.$lc-font-weight-semibold)
  color: #1A2B26; // ❌ raw hex
}
```
