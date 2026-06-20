# Epic: Multi-Language Support (Learn German in Your Native Language)

> Status: 📋 Planned · Ticket prefix: `LC-I18N` · Owner: TBD

## Context

LinguaCard helps users learn **German**, but today the entire experience is **English-only** in two distinct ways:

1. **UI chrome** (buttons, labels, menus, toasts, errors) — ~hundreds of strings hardcoded directly in `.html` templates and `.ts` files. No i18n library is installed.
2. **Learning content** (German word meanings, story translations, grammar notes, keyword glosses, quiz hints) — stored and AI-generated as English-only.

We want users to learn German **in their native language**: **English, Arabic, Ukrainian, Turkish, Spanish, and Russian**. Confirmed scope: **UI chrome _and_ learning content**, with **AI-generated translation drafts** for the 6 UI string bundles, and a language picker in **both Settings and first-launch onboarding**.

A single user-level preference — **`uiLanguage`** — drives everything. It selects both the ngx-translate UI bundle **and** the `nativeLang` used for all German learning content. (UI language === native learning language.)

### Key architectural findings

| Area | Current state | Implication |
|---|---|---|
| i18n library | None installed | Greenfield — add `@ngx-translate/core` + `@ngx-translate/http-loader` |
| UI strings | 100% hardcoded in templates + TS | Must extract to `assets/i18n/*.json` |
| `assets/i18n/` | Does not exist | `angular.json` already copies all of `apps/mobile/src/assets` → safe to add |
| Bootstrap | `bootstrapApplication` in `main.ts`, standalone providers | Register `provideTranslateService(...)` here |
| `ThemeService` | localStorage persist + apply at startup from `app.component.ts` | **Template for `LanguageService`** |
| RTL | Not handled anywhere (`<html lang="en">`, no `dir`) | Arabic needs `dir` + logical CSS |
| Onboarding folder | Exists but **empty** | Build first-launch language step here |
| `SettingsStore` / `user_settings` | Persists goals, reminders, timezone (local + server) | Natural home for `uiLanguage` |
| **Word dictionary** | Unique key `(lemmaKey, targetLang, nativeLang)`; enrich prompt already takes `nativeLanguage` | **Already multi-lingual ready** — minimal change |
| **Stories** | `bodyEn`, `StoryKeyword.english`, grammar/quiz fields English-only; prompts hardcode English | **Heavy lift** — schema + prompt rework |
| `LanguageCode` type | `en, de, fr, es, it, pt, ja, zh, ko, ar` | Missing `uk`, `tr`, `ru` — must add |

---

## Phasing strategy

Phases 1–3 (UI localization + selection + RTL) are **independently shippable** and deliver the bulk of perceived value. Phases 4–6 (content localization) layer on top. Phase 7 is QA/polish.

```
Phase 1  Foundation: ngx-translate + LanguageService        ← infra
Phase 2  String extraction + 6 translation bundles          ← the bulk of UI work
Phase 3  Language selection UX (Settings + onboarding + persistence)
Phase 4  RTL support (Arabic)
Phase 5  Content: Words/dictionary (small — already ready)
Phase 6  Content: Stories (user-generated + platform)
Phase 7  QA, locale data, polish
```

---

## Phase 1 — Foundation: ngx-translate + LanguageService

### LC-I18N-01 — Install & configure ngx-translate
- Add `@ngx-translate/core` and `@ngx-translate/http-loader` to root `package.json`.
- Register the service in `apps/mobile/src/main.ts` providers via `provideTranslateService({ loader: { provider: TranslateHttpLoader, ... }, fallbackLang: 'en' })`, loading from `./assets/i18n/` with `.json` suffix.
- Create `apps/mobile/src/assets/i18n/` with a starter `en.json` (`{}`). Confirm `angular.json` assets glob ships it.
- **AC:** App boots with `TranslateService` injectable; `assets/i18n/en.json` is served at runtime.

### LC-I18N-02 — Supported-languages registry
- Add a single source of truth `apps/mobile/src/app/core/i18n/supported-languages.ts`, exporting `{ code: LanguageCode; label: string; nativeName: string; flag: string; dir: 'ltr' | 'rtl' }` for `en, es, tr, uk, ru, ar` (ar → `rtl`).
- Extend `LanguageCode` in `libs/shared/domain/src/index.ts` to add `'uk' | 'tr' | 'ru'`.
- **AC:** Registry exported and typed; `LanguageCode` includes all 6 native languages.

### LC-I18N-03 — `LanguageService` (mirror `ThemeService`)
- Create `apps/mobile/src/app/core/services/language.service.ts`, `{ providedIn: 'root' }`, modeled on `core/services/theme.service.ts`:
  - `signal<LanguageCode>('en')` + readonly accessor (`current`).
  - `initialize()`: resolve in priority order → persisted `localStorage['lc-ui-language']` → server `SettingsStore.uiLanguage` → `navigator.language` match → `'en'`. Calls `apply()`.
  - `set(code)`: persist to localStorage, call `apply()`, push to `SettingsStore` for server sync.
  - `apply(code)`: `translateService.use(code)`, set `document.documentElement.lang`, set `document.documentElement.dir` from the registry (wires Phase 4).
- Call `languageService.initialize()` from `app.component.ts` next to `themeService.initialize()`.
- **AC:** Language persists across reloads; switching updates `<html lang>` and `<html dir>` live without a full reload.

---

## Phase 2 — String extraction + translation bundles

> Largest phase by volume. Do it **feature by feature** (one PR per feature area).

### LC-I18N-10 — Key naming convention & en.json scaffold
- Flat, namespaced convention: `feature.context.key` (e.g. `auth.login.signIn`, `home.dueCount`, `common.cancel`). Repeated strings live under `common.*`.
- **AC:** Convention documented; `common.*` seeded (Cancel, Save, Close, Retry, Loading…, etc.).

### LC-I18N-11 … LC-I18N-18 — Extract per feature
For each: move hardcoded strings into `en.json`, replace in templates with the `translate` pipe and in TS with `TranslateService.instant()`/`.get()`. Use ngx-translate interpolation for dynamic values and ICU/plurals where counts vary.

| Story | Feature area | Representative files |
|---|---|---|
| LC-I18N-11 | **Common/shared UI** | `shared/ui/*`, `shared/components/*`, `error.interceptor.ts`, `core/services/sync-notification.service.ts` |
| LC-I18N-12 | **Auth** | `features/auth/pages/{login,register,forgot-password}/*`, `reset-data-sheet.component.ts` |
| LC-I18N-13 | **Home / dashboard** | `features/home/pages/home/home.page.html` |
| LC-I18N-14 | **Vault + import** | `features/vault/pages/*`, `features/vault/components/*`, `features/vault/import/pages/*` |
| LC-I18N-15 | **Review** | `features/review/pages/*` |
| LC-I18N-16 | **Listen** | `features/listen/pages/*`, `features/listen/components/*` |
| LC-I18N-17 | **Stories (UI chrome only)** | `features/stories/pages/*` (content fields handled in Phase 6) |
| LC-I18N-18 | **Settings** | `features/settings/pages/{goals,reminders}/*` + new language page |

- **AC (each):** No hardcoded user-facing English remains in that feature; all keys present in `en.json`; app renders identically in English.
- **Note:** Convert programmatic strings too (toasts/alerts/error mappings) — easy to miss in `error.interceptor.ts` and `sync-notification.service.ts`.

### LC-I18N-19 — Generate the 5 translated bundles (AI drafts)
- Once `en.json` is frozen, produce `es.json`, `tr.json`, `uk.json`, `ru.json`, `ar.json` as AI first-pass drafts (preserve keys + `{{ }}` interpolation tokens exactly).
- Add a `README` in `assets/i18n/` noting drafts are machine-generated, pending human review.
- **AC:** All 6 bundles have identical key sets (parity check passes); tokens intact; app renders per language.

---

## Phase 3 — Language selection UX & persistence

### LC-I18N-20 — Domain + server: `uiLanguage`
- `libs/shared/domain/src/index.ts`: add `uiLanguage: LanguageCode` to `UserSettings` and `UpdateUserSettingsDto`.
- `apps/api/src/settings/user-settings.entity.ts`: add `@Column({ name: 'ui_language', type: 'varchar', length: 10, default: 'en' })`.
- TypeORM migration for `ui_language`; default existing rows to `'en'`; `createDefault()` sets it.
- Update `user-settings.service.ts` / controller to accept & validate the field.
- **AC:** `PATCH /settings/me` accepts `uiLanguage`; round-trips via `GET /settings/me`.

### LC-I18N-21 — `SettingsStore` integration
- Extend `features/settings/store/settings.store.ts` to expose/update `uiLanguage` via the existing optimistic-update + sync-queue pattern.
- `LanguageService.set()` calls into the store; store reconciles on load (server wins on first load, then user choice persists).
- **AC:** Changing language updates store, localStorage, and server.

### LC-I18N-22 — Settings language page
- New lazy route + page `features/settings/pages/language/` (sibling of `goals`, `reminders`). List 6 languages (label + native name + flag) with LDS components; current selection highlighted; tap → `LanguageService.set()`. Entry point from settings/user menu.
- **AC:** User can change UI language from Settings; UI updates live.

### LC-I18N-23 — First-launch onboarding picker
- Build the language step in the empty `features/onboarding/`. Show on first launch (no persisted language), defaulting to `navigator.language` match. Guard so it shows once.
- **AC:** New users pick a language on first run; applied immediately and persisted.

---

## Phase 4 — RTL support (Arabic)

### LC-I18N-30 — Directional document wiring
- `LanguageService.apply()` sets `document.documentElement.dir` (from LC-I18N-03). Verify Ionic mirrors components under `dir="rtl"`.
- **AC:** Selecting Arabic flips the whole app to RTL.

### LC-I18N-31 — SCSS logical-property audit
- Convert physical directional properties to logical: `margin-left/right` → `margin-inline-*`; `padding-left/right` → `padding-inline-*`; absolute `left/right` → `inset-inline-*`; `text-align: left/right` → `start/end`; mirror directional border-radius and transforms (chevrons/back arrows) via `dir`-aware rules.
- Prioritize headers, nav, word-item, badges, cards, sheets.
- **AC:** No layout breakage in Arabic across home, vault, review, story reader, settings.

### LC-I18N-32 — RTL visual QA pass
- Screenshot each major screen in Arabic; fix mirrored icons, clipped text, misaligned flex rows.
- **AC:** Documented screenshot review; issues triaged/fixed.

---

## Phase 5 — Content localization: Words / dictionary

> Smallest content phase — schema and AI prompt are **already multi-lingual**.

### LC-I18N-40 — Thread `nativeLang` through dictionary lookups
- `dictionary-api.service.ts` (`lookup`, `batchLookup`) already accept `nativeLang` (defaulted `'en'`). Replace defaults at call sites with `LanguageService.current()`. Callers: vault import-review, add-word sheet.
- **AC:** A Russian user importing words gets German→Russian translations cached under `(lemmaKey, 'de-DE', 'ru')` and rendered on the card.

### LC-I18N-41 — Persist native language on context / card creation
- Source `nativeLang` consistently from `uiLanguage`; if `LearningContext` owns the language pairing, set its native side from `uiLanguage`. (`CardContent.examples[].native` / `synonyms[].translation` are plain strings — each card is created in the user's language, so no per-language structure is needed.)
- **AC:** Cards created after a language switch use the new native language; existing cards untouched.

### LC-I18N-42 — Verify enrichment prompt output language
- `word-enrich-prompt.builder.ts` already interpolates `${nativeLanguage}`. Smoke-test enrichment for `ar/uk/tr/es/ru`.
- **AC:** Enrichment returns translations in the requested language for all 6.

---

## Phase 6 — Content localization: Stories

> Heaviest phase. Story content is English-only in both schema and prompts.

### LC-I18N-50 — Story domain model: native-language fields
- In `libs/shared/domain/src/index.ts`, add `nativeLang: LanguageCode` to `Story`/`PlatformStory`; treat English-suffixed translation fields as **native-language** fields. Recommended coordinated rename: `Story.bodyEn` → `bodyNative`; `StorySentence.english` → `native`; `StoryKeyword.english` → `translation`; `StoryGrammarNote.exampleEn`/`additionalExamples[].en` → `exampleNative`/`native`; `StoryQuizQuestion.hint` stays but generated in native language.
- Update reader: `story-reader.page.html`, `keywords-tab`, `grammar-tab`, quiz tab.
- **AC:** Reader renders the renamed native fields; English still works as the `'en'` case.

### LC-I18N-51 — Parameterize story-generation prompts
- `apps/api/src/stories/story-prompt.builder.ts`: add a `nativeLanguage` parameter to quiz, grammar, keywords prompts; replace every "in English" with `${nativeLanguage}`.
- `story-generation.service.ts`: pass the user's `uiLanguage` into all three calls; stamp `nativeLang` on the saved story.
- `GenerateStoryDto`: derive native language server-side from the authenticated user's settings (preferred over trusting the client).
- **AC:** A Turkish user generates a story whose translation/grammar/keywords/quiz are in Turkish; `nativeLang` persisted.

### LC-I18N-52 — Platform stories: per-language strategy
- Platform stories are **shared/canonical**, so store translatable content (sentence translations, keyword glosses, grammar, quiz hints, title translation) **keyed by `LanguageCode`** (JSONB `translations` map, or per-language child rows); keep the shared German body.
- Update `apps/api/src/admin/prompts/platform-story.prompt.md` and the admin import flow to accept a target native language and generate/store that bundle. Batch-generate the 6 languages for existing platform stories.
- Reader selects `translations[uiLanguage]`, falling back to `en`.
- **AC:** A platform story shows native translations for each of the 6 languages; missing → English fallback.

### LC-I18N-53 — Platform collections (word lists)
- Platform collections resolve words through the (per-language) dictionary. Confirm the adoption flow passes `nativeLang = uiLanguage`.
- **AC:** Adopting a platform collection as a Spanish user produces German→Spanish cards.

---

## Phase 7 — QA, locale data, polish

### LC-I18N-60 — Angular locale data & formatting
- `registerLocaleData` for `es, tr, uk, ru, ar`; align `LOCALE_ID` / locale-aware formatting where dates/numbers appear (streak dates, counts).
- **AC:** Numbers/dates render per active locale.

### LC-I18N-61 — Missing-key & fallback hardening
- Confirm `fallbackLang: 'en'`; add a missing-translation handler that logs (dev) and falls back to English. Add a key-parity check across the 6 bundles.
- **AC:** No raw `feature.key` strings ever surface; parity check passes.

### LC-I18N-62 — End-to-end verification
- Walk all major flows in each of the 6 languages (esp. Arabic for RTL): onboarding → pick language → register → home → import/enrich a word → review → generate a story → read story → settings change language.
- **AC:** Documented pass; defects triaged.

---

## Reuse, don't reinvent

- `ThemeService` (`core/services/theme.service.ts`) → copy its persist/apply/initialize shape for `LanguageService`.
- `SettingsStore` optimistic-update + sync-queue → reuse for `uiLanguage`.
- Word dictionary's `(lemmaKey, targetLang, nativeLang)` unique key + parameterized enrich prompt → no new dictionary schema.

## Constraints (from CLAUDE.md)

- **No `.spec.ts` files** — tests deferred project-wide.
- **LDS** — language page / onboarding use `<lc-button>` + LDS tokens; read `.claude/skills/lds.md` before any UI SCSS. No raw hex/px.
- **Angular rules** — `OnPush`, `input()`/`output()`, `inject()`, native control flow, no `any`, `signalStore` for state, services return `Observable<T>`.
- **Path alias** — domain types via `@lingua-card/shared/domain`.

## Verification

1. **UI parity (English):** after each Phase 2 story, `npm start` and confirm identical rendering — no raw keys.
2. **Language switch:** Settings → Language → each of the 6; confirm live re-render, persistence across reload, `<html lang/dir>` update.
3. **RTL:** select Arabic; screenshot home, vault, review, story reader, settings; confirm mirroring and no clipping.
4. **Content — words:** as a non-English user, import/enrich a German word; confirm translation language + correct `nativeLang` cache.
5. **Content — stories:** generate a user story in a non-English language; confirm native rendering. Open a platform story; confirm native translations + English fallback.
6. **Server:** `PATCH /settings/me { uiLanguage }` round-trips; migration applies cleanly on dev Postgres.
7. **Key parity:** run the parity check across all 6 bundles (LC-I18N-61).
