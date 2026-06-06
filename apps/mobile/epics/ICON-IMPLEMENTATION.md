# LinguaCard Icon Implementation Guide

## Design concept

The icon is built on three interlocking ideas native to LinguaCard:

- **Open book / two-page spread** — the physical metaphor for learning, knowledge, and the card vault. Left page = studied / known; right page = active / learning.
- **Serif capital "A"** — references the German alphabet, the act of starting from scratch, and the Lora display font used throughout the app.
- **"der" article badge** — the tiny blue pill in the bottom-right of the right page is the most recognisable micro-UI element in LinguaCard (the der/die/das gender badge). Including it makes the icon immediately legible to any user of the app.
- **Orange accent circle** (top-right) — the `--lc-accent` (#E07B3F) spark that appears on the FAB and CTAs throughout the UI. It breaks the symmetry of the green, creating visual tension and warmth.

---

## Color values used

| Role | Token | Hex |
|---|---|---|
| Background | `--lc-brand` | `#2D5A4E` |
| Spine | `--lc-brand-dark` | `#1A3830` |
| Left page | `--lc-brand-light` | `#E8F2EE` |
| Right page | white | `#FFFFFF` |
| Page lines | `--lc-brand-mid` | `#4A8C7A` |
| "A" glyph | `--lc-brand` | `#2D5A4E` |
| Article badge bg | `--lc-masc-bg` | `#EAF2FC` |
| Article badge text | `--lc-masc-text` | `#1A56A3` |
| Accent dot | `--lc-accent` | `#E07B3F` |
| Accent inner | `--lc-accent-light` | `#FDF0E6` |

---

## File sizes to generate

From the two source SVGs (`icon-master.svg` and `favicon.svg`), export the following:

### App icon (from `icon-master.svg`)

| File | Size | Use |
|---|---|---|
| `icon-1024.png` | 1024 × 1024 | App Store / Play Store submission |
| `icon-512.png` | 512 × 512 | PWA manifest (`512x512`) |
| `icon-192.png` | 192 × 192 | PWA manifest (`192x192`), Android splash |
| `icon-180.png` | 180 × 180 | iOS `apple-touch-icon` |
| `icon-167.png` | 167 × 167 | iPad Pro retina |
| `icon-152.png` | 152 × 152 | iPad retina |
| `icon-120.png` | 120 × 120 | iPhone retina |
| `icon-76.png` | 76 × 76 | iPad non-retina |

For iOS: export **without** the rounded corners — iOS applies its own mask. Set `rx="0"` or crop to a plain square when exporting.

For Android adaptive icon:
- `ic_launcher_foreground.xml` — the book + A + badge + orange dot, centered in a 108dp canvas (safe zone = inner 72dp circle). No background fill.
- `ic_launcher_background.xml` — solid `#2D5A4E` fill.

### Favicon (from `favicon.svg`)

| File | Size | Use |
|---|---|---|
| `favicon.svg` | vector | Modern browsers (preferred) |
| `favicon-32.png` | 32 × 32 | Fallback PNG |
| `favicon-16.png` | 16 × 16 | Oldest fallback |
| `favicon.ico` | multi-size | Legacy IE / embed scenarios |

---

## Export commands (using Inkscape CLI or sharp/svgexport)

```bash
# Using svgexport (npm install -g svgexport)
svgexport icon-master.svg icon-1024.png 1024:1024
svgexport icon-master.svg icon-512.png  512:512
svgexport icon-master.svg icon-192.png  192:192
svgexport icon-master.svg icon-180.png  180:180
svgexport icon-master.svg icon-167.png  167:167
svgexport icon-master.svg icon-152.png  152:152
svgexport icon-master.svg icon-120.png  120:120
svgexport icon-master.svg icon-76.png   76:76
svgexport favicon.svg     favicon-32.png 32:32
svgexport favicon.svg     favicon-16.png 16:16

# Or using sharp in Node.js (recommended for CI):
# sharp input: icon-master.svg → output: PNG at each size
```

---

## HTML head tags

```html
<!-- Primary favicon (SVG, dark-mode aware) -->
<link rel="icon" type="image/svg+xml" href="assets/icon/favicon.svg"/>

<!-- PNG fallback -->
<link rel="icon" type="image/png" sizes="32x32" href="assets/icon/favicon-32.png"/>
<link rel="icon" type="image/png" sizes="16x16" href="assets/icon/favicon-16.png"/>

<!-- iOS home screen icon -->
<link rel="apple-touch-icon" sizes="180x180" href="assets/icon/icon-180.png"/>
<link rel="apple-touch-icon" sizes="167x167" href="assets/icon/icon-167.png"/>
<link rel="apple-touch-icon" sizes="152x152" href="assets/icon/icon-152.png"/>
<link rel="apple-touch-icon" sizes="120x120" href="assets/icon/icon-120.png"/>

<!-- Theme colour (matches --lc-brand) -->
<meta name="theme-color" content="#2D5A4E"/>
<meta name="apple-mobile-web-app-title" content="LinguaCard"/>
```

> Your `index.html` already has `<link rel="icon" href="assets/icon/favicon.png">` and `<meta name="theme-color" content="#2D5A4E">`. Replace the single PNG link with the SVG + fallback set above.

---

## PWA manifest (`manifest.webmanifest`)

```json
{
  "name": "LinguaCard",
  "short_name": "LinguaCard",
  "description": "German vocabulary learning with spaced repetition",
  "theme_color": "#2D5A4E",
  "background_color": "#2D5A4E",
  "display": "standalone",
  "orientation": "portrait",
  "icons": [
    {
      "src": "assets/icon/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "assets/icon/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

> The 512 × 512 icon is marked `maskable` because the book is centred with safe-zone padding. Android will apply its own shape mask (circle, squircle, etc.) and it will not clip the critical elements.

---

## Android adaptive icon (`res/mipmap-anydpi-v26/ic_launcher.xml`)

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/lc_brand"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
```

`res/values/colors.xml`:
```xml
<resources>
  <color name="lc_brand">#2D5A4E</color>
</resources>
```

For the Capacitor project at `ios/App/App/Assets.xcassets/AppIcon.appiconset/`:
Export `icon-1024.png` and let Xcode or `capacitor-assets` generate all iOS sizes automatically.

---

## Capacitor `capacitor-assets` workflow

If you are using `@capacitor/assets` (recommended):

```bash
npm install -g @capacitor/assets
npx capacitor-assets generate \
  --assetPath icon-master.svg \
  --ios \
  --android
```

This reads `icon-master.svg`, generates all required PNG sizes, and writes them to the correct Xcode / Android Studio paths. The only requirement is that the SVG is a perfect square and has no transparency outside the safe zone.

---

## Dark-mode favicon

The SVG favicon can automatically adapt to system dark mode using a CSS media query embedded in the SVG:

```xml
<!-- In favicon.svg, after the base background rect: -->
<style>
  @media (prefers-color-scheme: dark) {
    #bg { fill: #1A3830; }
  }
</style>
<rect id="bg" width="32" height="32" rx="7" fill="#2D5A4E"/>
```

In dark mode the favicon shifts from `#2D5A4E` to the darker `#1A3830`, maintaining legibility against browser chrome.

---

## File structure

```
apps/mobile/src/assets/icon/
├── favicon.svg          ← vector favicon (primary)
├── favicon-32.png       ← PNG fallback 32 × 32
├── favicon-16.png       ← PNG fallback 16 × 16
├── icon-76.png
├── icon-120.png
├── icon-152.png
├── icon-167.png
├── icon-180.png         ← apple-touch-icon
├── icon-192.png         ← PWA / Android
├── icon-512.png         ← PWA maskable
└── icon-1024.png        ← store submission

Source SVGs (not shipped to browser):
design/icons/
├── icon-master.svg      ← 1024 × 1024 master
└── favicon.svg          ← 32 × 32 pixel-hinted
```
