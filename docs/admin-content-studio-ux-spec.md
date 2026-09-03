# Admin Content Studio UX specification

## Product goal

Make creating, reviewing, and publishing learner content feel like one predictable workflow. An administrator should always know what they are creating, what input is required, what the system will do next, and whether learners can already see the result.

## Audit summary

The previous Admin Import screen mixed five destinations in one flat, horizontally constrained tab row: collection upload, story import, collection management, story management, and podcasts. Within collection upload, the thumbnail appeared before essential metadata, “Word list” and “JSON” were unexplained technical labels, required fields relied on asterisks, and the primary action did not explain whether importing also published content. AI prompts occupied a large part of the workflow before the administrator reached the required inputs. Management cards also placed several actions in a single row that became difficult to scan and tap on mobile.

There is a separate V2 preview-first importer in the codebase, but `/admin/import/v2` currently redirects to the legacy screen. This creates two implementations without giving administrators access to the safer validation and readiness workflow.

## Information architecture

The Content Studio has three top-level destinations:

1. **Create** — create a collection or story draft.
2. **Manage** — review, edit, publish, unpublish, or delete collections and stories.
3. **Podcasts** — continue to the dedicated podcast administration workflow.

Within Create, the administrator first selects **Collection** or **Story**. Within a collection, they select one of two clearly described inputs:

- **Quick word list** — best for a short list of German words; enrichment happens during import.
- **Enriched JSON** — best when translations, examples, and synonyms are already prepared.

Within Manage, Collections and Stories remain separate subviews so actions and metadata remain relevant to the selected content type.

## Core workflow

### Create a collection

1. Select Collection.
2. Choose Quick word list or Enriched JSON based on the explanatory subtitle.
3. Enter a learner-facing title and CEFR level.
4. Optionally add a cover image.
5. Add vocabulary. The quick mode shows a live parsed word count and explains ignored lines and optional articles.
6. Create the draft. The action and supporting copy must state that nothing is published automatically.
7. Show a persistent in-page success state with created, reused, enriched, and audio-linked counts as applicable.
8. Continue to Manage for review and publishing.

### Create a story

1. Select Story.
2. Copy the approved generation prompt when needed.
3. Link the target collection using its collection ID.
4. Paste the story JSON.
5. Choose fiction and narration options with consequence-oriented descriptions.
6. Create the draft, review it, then publish from Manage.

### Manage content

1. Select Collections or Stories.
2. Load the relevant list automatically on first entry.
3. Read status, level, language direction, readiness, and content counts before taking action.
4. Keep editing and word management secondary to the publish state.
5. Require explicit confirmation for deletion and explain affected data.

## Interaction and content rules

- Use “Create … draft” for mutation buttons. Do not use “Import” alone when the resulting visibility is unclear.
- Never publish as a side effect of creation.
- Explain technical formats at the point of choice, not in detached documentation.
- Show validation and progress inline and announce it through a polite live region.
- Keep the administrator’s input after a failed request.
- Disable only the action that is currently running; do not block unrelated list items.
- Use sentence case and learner-facing terminology. Prefer “Collection ID” over “Platform Collection ID.”
- Use registered Ionicons and accessible labels for icon-only actions.

## Responsive behavior

- The content column is capped at 920px for comfortable desktop reading and remains fluid on mobile.
- Top-level navigation scrolls horizontally below 620px rather than clipping labels.
- Content-type and input-method cards collapse to one column below 420px.
- Management cards wrap actions to a separate row on narrow screens and preserve at least a 36px minimum control height.
- Long IDs and metadata wrap or truncate without forcing horizontal page overflow.

## Accessibility acceptance criteria

- Every navigation group has an accessible name.
- The active destination is distinguishable by more than text weight alone.
- All form fields have programmatic labels and visible help text where format matters.
- Focused inputs have a visible high-contrast focus ring.
- Icon-only actions have specific accessible labels.
- Loading, success, warning, and failure feedback remains visible in the page and is announced.
- Destructive actions retain confirmation dialogs with clear consequences.

## Recommended next iteration

Promote the existing V2 preview-first importer into the default enriched-JSON path instead of maintaining a second unreachable screen. Its validation summary, conflict list, readiness checks, and import progress are the correct long-term pattern. After that integration, add collection selection/search to Story creation so administrators never need to copy a UUID, and split the current all-in-one route component into route containers plus presentational Create and Manage components.

## Success measures

- Median time from opening Content Studio to creating a valid draft.
- Validation failure rate by input method.
- Percentage of drafts successfully reviewed and published without leaving the workflow.
- Accidental or immediately reversed publish actions.
- Support requests mentioning JSON shape, collection IDs, missing covers, or publish state.
