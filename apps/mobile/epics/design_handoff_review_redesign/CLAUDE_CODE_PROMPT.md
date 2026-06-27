# Claude Code Prompt — Implement the Review Redesign

Paste the following into Claude Code from the root of the LinguaCard repo, with this `design_handoff_review_redesign/` folder available. Work screen‑by‑screen and verify against the prototype after each.

---

You are implementing a **premium redesign of the Review feature** in the LinguaCard app (Angular 21 + Ionic 8 + Capacitor).

**Read first, in this order:**
1. `design_handoff_review_redesign/README.md` — the full visual + behavioral spec (9 screens, 3 study modes, exact tokens, the typed‑answer grading algorithm).
2. `design_handoff_review_redesign/reference/lds-skill.md` — the design‑system contract. **All styling must use LDS tokens and `lc-*` shared components. No raw hex / px / shadow / font values in component SCSS.**
3. `design_handoff_review_redesign/reference/epic-review-system-reconciliation.md` — the canonical SRS/mastery logic. **Bind all due/new/mastered/struggling counts, mastery distribution, streak/weekly data, and SM‑2 scheduling to the existing shared selectors / `ReviewStore` / stats facade. Do NOT re‑derive counts locally.**
4. `design_handoff_review_redesign/Review.dc.html` — the working HTML prototype and **ground‑truth visual spec**. Open it in a browser (with `support.js` beside it) to see every state. Read its `<script data-dc-script>` block for the exact grading logic, state transitions, and sample data.

**The prototype is a design reference, not code to copy.** Recreate it natively: Angular standalone components, `ChangeDetectionStrategy.OnPush`, `input()` signals, flat scoped class names (no BEM), `<ion-content>` for scroll containers, and the shared `<lc-article-badge> / <lc-mastery-dot> / <lc-word-item> / <lc-button> / <lc-category-chip> / <lc-empty-state>` where they fit.

**Important — new design tokens:** the redesign introduces a new type system (Spectral / Hanken Grotesk / Spline Sans Mono) and a warm cream palette that differ from the current LDS values (Lora / DM Sans / Fira Code). These are catalogued in the README. **Before building, confirm with me whether to update `_tokens.scss` (+ `_dark.scss`) to the redesign values** (this redesign is shared with Vault / Story Studio / Listen). Then implement strictly against tokens — never against raw values.

**Build order (verify each against the prototype before moving on):**
1. Token alignment in `_tokens.scss` / `_dark.scss` (after we confirm).
2. **Review hub** — hero, mastery snapshot, leech callout, study‑mode picker, quick‑study, recent sessions.
3. **Session player** shell — top bar, progress, the `screen`/`mode` state machine.
4. **Front faces** — Flip & rate, Type answer (with **ä ö ü ß** accent keys), Listen first.
5. **Back face** — full rich detail (article/gender, plural+audio, examples with headword bolded, usage note, expandable synonyms). No mastery‑progress block here.
6. **Rating footer** — Again/Hard/Good/Easy with SM‑2 intervals; suggested‑rating highlight in Type mode.
7. **Typed‑answer grading** — implement the strict article/gender algorithm exactly as specified (Levenshtein ≤ 2 for "close", required `der/die/das`, per‑character green/red diff, gender note). Add unit tests for: exact match, right‑noun‑missing‑article, right‑noun‑wrong‑article, near‑miss spelling, wrong, and a verb (no article).
8. **Session complete**, **Mastery breakdown**, **Session history**, **Custom study**, **Leeches**.

**Constraints & acceptance:**
- Pixel‑match the prototype (spacing, type scale, colors, radii, shadows) using tokens.
- Support **dark mode** via CSS custom properties (never hardcoded colors).
- Respect existing store ownership (review state in `ReviewStore`; shared stats via the facade). Wire real data; the prototype's numbers are sample data.
- Every tappable element uses `@include u.touch-state()` and meets a ≥44px hit target.
- Keep motion subtle and reliable; do not use opacity‑based entrance animations that can leave content stuck (the prototype removed these deliberately).
- Don't add features or screens beyond this spec without asking.

Start by reading the four files above, then propose a component/file plan and the token diff for my approval before writing code.
