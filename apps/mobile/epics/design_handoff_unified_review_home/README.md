# Unified Review Home — Dark Theme Screen Concepts

**Status:** Concept designs for product review  
**Implementation:** Complete  
**Source specification:** [`../unified-review-home-design-implementation-spec.md`](../unified-review-home-design-implementation-spec.md)

## Screens

| Screen | File | Purpose |
|---|---|---|
| Ready | [`review-home-ready-dark.png`](review-home-ready-dark.png) | Normal daily entry with one Start action |
| Resume | [`review-home-resume-dark.png`](review-home-resume-dark.png) | Active session takes priority over starting a new one |
| Complete | [`review-home-complete-dark.png`](review-home-complete-dark.png) | Calm stopping state with no dominant extra-practice CTA |
| Empty | [`review-home-empty-dark.png`](review-home-empty-dark.png) | First-use path to add or import vocabulary |
| Error | [`review-home-error-dark.png`](review-home-error-dark.png) | Recoverable failure with one Retry action |
| Review settings | [`review-settings-sheet-dark.png`](review-settings-sheet-dark.png) | Progressive disclosure for mode and audio preferences |
| More practice | [`more-practice-dark.png`](more-practice-dark.png) | Secondary destination for intentional focused sessions |

## Shared visual direction

- Default dark theme, not a dark-mode variant of a light-first design.
- Warm charcoal base with matte forest-charcoal surfaces.
- Ivory primary text and restrained secondary text.
- Mint green for the primary action and selected state.
- Brass appears only as a small semantic accent.
- Editorial serif headings with clean sans-serif controls and compact mono eyebrows.
- Four primary tabs: Review, Vault, Stories, Listen.
- One visually dominant action in actionable landing states.
- No dashboard charts, feed content, mastery cards, queue cards, or quick-action grid on Review home.

Suggested implementation palette:

| Role | Value |
|---|---|
| App background | `#111714` |
| Elevated surface | `#17211D` |
| Strong surface | `#1B2923` |
| Primary/selected | `#2E6B52` |
| Highlight mint | `#83E5B4` |
| Primary text | `#F4EFE4` |
| Secondary text | `#B8B2A7` |
| Restrained accent | `#D8B981` |
| Subtle border | `rgba(244, 239, 228, 0.10)` |

These colors are design targets. Implementation should map them to the existing LDS token system instead of introducing page-local raw values.

## Prompt set

The concepts were generated with the built-in image-generation workflow using the `ui-mockup` use case. The shared prompt requested a high-fidelity, production-oriented 9:16 mobile interface with LinguaCard's warm editorial styling, default dark theme, cream/forest/brass lineage, practical touch targets, and a four-tab navigation model.

Per-screen prompt intent:

1. **Ready:** “Your review is ready,” exact session size/time, one Start CTA, compact preference/status rows.
2. **Resume:** active-session continuity, remaining cards/time, one Resume CTA, no Start action.
3. **Complete:** “You’re done for today,” reviewed count, progress and optional practice as quiet links, no CTA.
4. **Empty:** focused add-vocabulary message, one Add words CTA, Import words secondary.
5. **Error:** concise recoverable message, one Retry CTA, no technical terminology.
6. **Review settings:** bottom sheet with only study mode and audio preferences plus Done.
7. **More practice:** scan-friendly list for New words, Struggling cards, Leeches, and Custom study.

All prompts explicitly excluded charts, dashboard density, content feeds, illustrations, decorative glow, extra marketing copy, and watermarks.

## Review notes

- Treat these as direction-setting concepts, not pixel-perfect implementation measurements.
- Copy, state priority, and content hierarchy are binding unless revised during product review.
- Use Ionicons in production; generated icon shapes are illustrative.
- Validate heading wrapping at real device widths and large text sizes.
- The final implementation must use exact session-planning data rather than the sample counts in these images.
