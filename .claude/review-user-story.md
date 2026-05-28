# LC-042 — Review Hub: A Complete Review System Redesign
## Epic 1 — Vocabulary Vault / Review

---

## Research Summary

### What the best apps do

**Anki's filtered decks** are the gold standard for targeted review. They allow filtering cards by: oldest seen first, most lapses (failed), increasing/decreasing intervals, order due, random, latest added, and relative overdueness. Anki also offers "Custom Study" presets — one-click sessions for common needs like "review today's failed cards" or "increase new card limit".

**Brainscape's Confidence-Based Repetition (CBR)** uses a 1–5 confidence scale where cards rated lower appear more frequently. Brainscape shows Mastery % per deck as a weighted average of all card confidences, and provides a "Checkpoint" screen after each round showing estimated study time remaining. Cards filter out automatically once mastered.

**Common patterns across top apps:**
- A **review dashboard** that shows due counts broken down by difficulty — not just a single number
- **Quick-start presets** for the most common review scenarios (due today, hard cards only, new cards only)
- **Custom study builders** where users compose a filtered session from mastery level, collection, sort order, and card limit
- **Session history** showing past sessions with per-session stats (cards, duration, avg rating)
- **"Leech" / struggling card detection** — cards that have been failed 3+ times get surfaced for focused attention

### What LinguaCard currently has vs what it needs

| Feature | Current | After this ticket |
|---|---|---|
| Review entry | Single "Review cards" button on home screen | Full Review Hub dashboard with breakdown |
| Card selection | All due cards, no filtering | Filter by mastery, collection, rating, sort order |
| Session presets | None | 3 quick-start presets + custom study builder |
| Session history | None | Scrollable list with per-session stats |
| Struggling cards | None | Dedicated view with lapse count and avg rating |
| Mastery breakdown | None | Visual bar chart, tap-to-review per level |
| Post-session | Summary screen (from LC-041) | Unchanged — already built |

---

## Story

**As a** learner with hundreds of vocabulary cards across multiple collections,
**I want** a review dashboard that shows me exactly what needs attention, lets me build custom study sessions by mastery level or difficulty, and shows my review history,
**So that** I spend my study time on the cards that matter most and can track my improvement over time.

---

## Context for Claude Code

Open `design-reference.html` and scroll to the last 5 screens in the **📱 Screens** tab:

| Screen | What it shows |
|---|---|
| **11 · Review Hub** | Main dashboard: due donut, mastery breakdown, quick-start presets, recent sessions |
| **11a · Custom study builder** | Filter builder: source collection, mastery level checkboxes, sort order, card limit slider |
| **11b · Mastery breakdown** | Horizontal bar chart of all cards by mastery level, each level tappable to start a review |
| **11c · Session history** | List of past sessions with date, avg rating pill, stats row (cards, duration, struggled, nailed) |
| **11d · Struggling cards** | "Leech" cards with 3+ fails, sorted by fail count, article-coloured backgrounds, bulk review button |

The existing flashcard player (screens 03, 03a) and session summary (from LC-041) are unchanged — this ticket only adds the **entry points** and **filtering logic** that feed cards into the existing player.

---

## Architecture

### The review pipeline

```
User picks a review mode (hub preset, custom study, or collection review)
         │
         ▼
ReviewFilterService.buildQueue(filters) → Card[]
         │  Queries CardStore with mastery, collection, rating, sort, limit filters
         │  Returns a sorted, limited array of Card objects
         │
         ▼
ReviewSessionStore.startSession(cards, metadata)
         │  Existing store from LC-041 — no changes needed
         │
         ▼
Flashcard player (screen 03/03a)
         │  Existing player — no changes needed
         │
         ▼
Session summary (from LC-041)
         │  Existing summary — no changes needed
         │
         ▼
Navigate back to Review Hub (updated due counts)
```

The key new piece is `ReviewFilterService` — a pure filtering/sorting service that composes card queues from the user's selections.

---

## New service: `ReviewFilterService`

**File:** `src/app/features/review/services/review-filter.service.ts`

```typescript
export interface ReviewFilters {
  source: 'all' | string;          // 'all' or a collectionId
  masteryLevels: MasteryLevel[];   // e.g. [0, 1, 2] for new+hard+learning
  sortOrder: 'hardest' | 'oldest' | 'random' | 'due_date' | 'most_lapses';
  limit: number;                   // max cards in session (10–100)
}

export interface ReviewPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  colour: string;
  filters: ReviewFilters;
}

@Injectable({ providedIn: 'root' })
export class ReviewFilterService {
  constructor(
    private cardStore: CardStore,
    private authService: AuthService,
  ) {}

  /** The three quick-start presets shown on the Review Hub */
  readonly presets: ReviewPreset[] = [
    {
      id: 'due-today',
      label: 'Due today',
      description: 'All cards due for review right now',
      icon: 'calendar-outline',
      colour: 'var(--lc-brand)',
      filters: { source: 'all', masteryLevels: [0,1,2,3,4,5], sortOrder: 'due_date', limit: 50 },
    },
    {
      id: 'struggling',
      label: 'Struggling cards',
      description: 'Cards you\'ve failed 3+ times',
      icon: 'alert-triangle',
      colour: '#B91C1C',
      filters: { source: 'all', masteryLevels: [0,1,2], sortOrder: 'most_lapses', limit: 30 },
    },
    {
      id: 'new-only',
      label: 'New cards only',
      description: 'Never-reviewed vocabulary',
      icon: 'plus-circle',
      colour: 'var(--lc-accent)',
      filters: { source: 'all', masteryLevels: [0], sortOrder: 'random', limit: 20 },
    },
  ];

  /**
   * Build a review queue from filters.
   * This is a pure, synchronous filter over the in-memory CardStore.
   */
  buildQueue(filters: ReviewFilters): Card[] {
    const now = new Date();
    let cards = this.cardStore.cards();

    // 1. Filter by source (collection)
    if (filters.source !== 'all') {
      cards = cards.filter(c => c.collectionId === filters.source);
    }

    // 2. Filter by mastery level
    cards = cards.filter(c =>
      filters.masteryLevels.includes(c.srsState?.masteryLevel ?? 0)
    );

    // 3. For "due today" preset: only include cards whose nextDueAt <= now
    if (filters.sortOrder === 'due_date') {
      cards = cards.filter(c =>
        c.srsState && new Date(c.srsState.nextDueAt) <= now
      );
    }

    // 4. For "struggling": filter to cards with 3+ lapses
    // A "lapse" is when the card was rated 0 or 1 after previously being at mastery >= 2
    // For simplicity in the json-server era: cards at mastery 0-1 with repetitions > 0
    if (filters.sortOrder === 'most_lapses') {
      cards = cards.filter(c => {
        const s = c.srsState;
        return s && s.repetitions > 0 && s.masteryLevel <= 2;
      });
    }

    // 5. Sort
    cards = this.sortCards(cards, filters.sortOrder);

    // 6. Limit
    return cards.slice(0, filters.limit);
  }

  private sortCards(cards: Card[], order: ReviewFilters['sortOrder']): Card[] {
    switch (order) {
      case 'hardest':
        return [...cards].sort((a, b) =>
          (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0)
        );
      case 'oldest':
        return [...cards].sort((a, b) => {
          const aDate = a.srsState?.lastReviewedAt ?? a.createdAt;
          const bDate = b.srsState?.lastReviewedAt ?? b.createdAt;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        });
      case 'due_date':
        return [...cards].sort((a, b) =>
          new Date(a.srsState?.nextDueAt ?? 0).getTime() -
          new Date(b.srsState?.nextDueAt ?? 0).getTime()
        );
      case 'most_lapses':
        return [...cards].sort((a, b) =>
          (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0)
        );
      case 'random':
        return [...cards].sort(() => Math.random() - 0.5);
      default:
        return cards;
    }
  }

  /** Count cards per mastery level (for the donut and breakdown) */
  getMasteryDistribution(collectionId?: string): Record<MasteryLevel, number> {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MasteryLevel, number>;
    cards.forEach(c => {
      const level = c.srsState?.masteryLevel ?? 0;
      dist[level]++;
    });
    return dist;
  }

  /** Count cards due today (for the donut center number) */
  getDueTodayCount(collectionId?: string): number {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c => c.srsState && new Date(c.srsState.nextDueAt) <= now).length;
  }

  /** Get struggling cards (3+ lapses) for the dedicated screen */
  getStrugglingCards(limit = 30): Card[] {
    return this.cardStore.cards()
      .filter(c => {
        const s = c.srsState;
        return s && s.repetitions > 0 && s.masteryLevel <= 1;
      })
      .sort((a, b) => (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0))
      .slice(0, limit);
  }
}
```

---

## Screens

### Screen 11 — Review Hub

**Route:** `/review` (replaces the current simple review page)
**File:** `src/app/features/review/pages/review-hub/review-hub.page.ts`

This becomes the primary screen when the user taps "Review" in the bottom nav. It replaces the old behaviour of immediately starting a session.

**Layout (match screen 11 in design-reference.html):**

1. **Due today hero** with donut chart:
   - SVG donut showing mastery level distribution of due cards (grey=new, red=hard, yellow=learning, green=review)
   - Centre: total due count + "due" label
   - Right: text breakdown "16 new · 8 hard · 6 learning · 12 review"
   - Below: "Start today's review" full-width white button

2. **Quick study presets:**
   - "Struggling cards" (red icon, card count)
   - "New cards only" (accent icon, card count)
   - "Custom study" (green icon, chevron → navigates to 11a)
   - Each preset card: icon circle + title + subtitle + count/chevron

3. **Recent sessions:**
   - Header: "Recent sessions" + "See all →" link (→ screen 11c)
   - 2 most recent sessions as compact rows (dot colour + title + meta + avg rating)

**Behaviour:**
- "Start today's review" → builds queue with `{ source: 'all', masteryLevels: [0,1,2,3,4,5], sortOrder: 'due_date', limit: 50 }` → starts session
- "Struggling cards" → navigates to screen 11d
- "New cards only" → builds queue with `{ masteryLevels: [0] }` → starts session immediately
- "Custom study" → navigates to `/review/custom`
- "See all →" → navigates to `/review/history`
- Session row tap → navigates to session detail (future; for now, no action)

---

### Screen 11a — Custom Study Builder

**Route:** `/review/custom`
**File:** `src/app/features/review/pages/custom-study/custom-study.page.ts`

**Sections:**

1. **Source picker** — a button showing the current collection (or "All collections"). Tapping opens the `AssignCollectionSheet` in read-only/picker mode.

2. **Mastery level filter** — 6 toggle cards (3×2 grid) for mastery levels 0–5. Each shows: coloured dot, count, label. Tapping toggles selection (multi-select). Selected cards have brand border + light background.

3. **Sort order** — 4 chip buttons: "Hardest first" (default), "Oldest first", "Random", "Due date". Single-select.

4. **Card limit** — slider from 10 to 100 (step 5). Shows the current value in a large number on the right.

5. **Preview count** — green-tinted bar showing "Cards matching your filters: N". Updates live as filters change.

6. **Start button** — "Start session (N cards)" where N is `min(matchingCount, limit)`.

**Behaviour:**
```typescript
// custom-study.page.ts
source       = signal<string>('all');
masteryLevels = signal<MasteryLevel[]>([0, 1, 2]);
sortOrder    = signal<ReviewFilters['sortOrder']>('hardest');
limit        = signal<number>(30);

filters = computed<ReviewFilters>(() => ({
  source: this.source(),
  masteryLevels: this.masteryLevels(),
  sortOrder: this.sortOrder(),
  limit: this.limit(),
}));

matchingCount = computed(() =>
  this.filterService.buildQueue({ ...this.filters(), limit: 9999 }).length
);

sessionCount = computed(() =>
  Math.min(this.matchingCount(), this.limit())
);

startSession(): void {
  const queue = this.filterService.buildQueue(this.filters());
  if (!queue.length) {
    this.toast.error('No cards match your filters.');
    return;
  }
  this.sessionStore.startSession(queue, this.source());
  this.router.navigate(['/review/player']);
}
```

---

### Screen 11b — Mastery Breakdown

**Route:** `/review/mastery`
**File:** `src/app/features/review/pages/mastery-breakdown/mastery-breakdown.page.ts`

Shows a horizontal bar chart of all cards grouped by mastery level. Each row has a play button that starts a review session with just that level's cards.

**Layout (match screen 11b):**
- Collection selector (same `cs-source-btn` as screen 11a)
- 6 bar rows (mastery 5 at top, 0 at bottom): coloured dot, label, horizontal bar (width = count/maxCount * 100%), count number, play button circle
- Tip box: "Tap the ▶ play button next to any level to start a review session with just those cards."

**Behaviour:**
- Play button on mastery level N → builds queue `{ masteryLevels: [N], source: currentCollection, sortOrder: 'random', limit: 50 }` → starts session
- Bar row tap → same as play button
- Collection selector → updates all counts and bar widths

---

### Screen 11c — Session History

**Route:** `/review/history`
**File:** `src/app/features/review/pages/session-history/session-history.page.ts`

**Layout (match screen 11c):**
- Filter chips: "All sessions", "This week", "This month"
- Session cards, each showing:
  - Title (collection name or "All due cards" or "Custom study — hard cards")
  - Date/time
  - Avg rating pill: green (≥4.0), amber (3.0–3.9), red (<3.0)
  - Stats row: 4 cells (Cards, Duration, Struggled, Nailed)

**Data source:** `GET /reviewSessions?userId=...&_sort=startedAt&_order=desc&_limit=30`

**Stats computation:**
```typescript
computeSessionStats(session: ReviewSession): SessionStats {
  const ratings = Object.values(session.ratings);
  return {
    totalCards: session.totalCards,
    duration: this.formatDuration(session.startedAt, session.completedAt),
    avgRating: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '–',
    struggled: ratings.filter(r => r <= 2).length,
    nailed: ratings.filter(r => r === 5).length,
  };
}
```

**Filter logic:**
- "This week": sessions where `startedAt >= 7 days ago`
- "This month": sessions where `startedAt >= 30 days ago`

---

### Screen 11d — Struggling Cards (Leeches)

**Route:** `/review/struggling`
**File:** `src/app/features/review/pages/struggling-cards/struggling-cards.page.ts`

**Layout (match screen 11d):**
- Red warning banner: "N cards need extra attention" + explanation
- Card list sorted by fail count descending. Each card shows:
  - Article-coloured background (same `articleBg` pipe from LC-031)
  - Article badge + German word
  - Fail count badge (red for 4+, amber for 3)
  - English translation
  - Meta: "Last reviewed: Xd ago · Avg rating: N.N"
- "Review all N struggling cards" red button

**"Struggling" definition:**
A card is "struggling" / a "leech" when:
```typescript
isStruggling(card: Card): boolean {
  const s = card.srsState;
  if (!s) return false;
  // Card has been reviewed at least once AND is still at mastery 0 or 1
  return s.repetitions > 0 && s.masteryLevel <= 1;
}
```

This catches cards that have been seen but keep getting failed — the user can't get them to stick. The fail count badge shows `repetitions - (masteryLevel * 2)` as a rough "times you've struggled with this" number.

**Behaviour:**
- Review button → builds queue with all struggling cards, sorted by lowest mastery → starts session
- Individual card tap → navigates to Word Detail (screen 05)

---

## Routing

```typescript
// review.routes.ts
const reviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/review-hub/review-hub.page').then(m => m.ReviewHubPage),
  },
  {
    path: 'custom',
    loadComponent: () =>
      import('./pages/custom-study/custom-study.page').then(m => m.CustomStudyPage),
  },
  {
    path: 'mastery',
    loadComponent: () =>
      import('./pages/mastery-breakdown/mastery-breakdown.page').then(m => m.MasteryBreakdownPage),
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./pages/session-history/session-history.page').then(m => m.SessionHistoryPage),
  },
  {
    path: 'struggling',
    loadComponent: () =>
      import('./pages/struggling-cards/struggling-cards.page').then(m => m.StrugglingCardsPage),
  },
  {
    path: 'player',
    loadComponent: () =>
      import('./pages/review-player/review-player.page').then(m => m.ReviewPlayerPage),
  },
  {
    path: 'summary',
    loadComponent: () =>
      import('./pages/session-summary/session-summary.page').then(m => m.SessionSummaryPage),
  },
];
```

---

## Integration with existing features

### Home screen hero card
The home screen "Review cards" button now navigates to `/review` (the hub) instead of immediately starting a session. The due count number remains on the home hero card.

### Collection detail (screen 07a)
The "Review (14)" button on a collection detail page now builds a filtered queue scoped to that collection:
```typescript
reviewCollection(): void {
  const queue = this.filterService.buildQueue({
    source: this.collectionId,
    masteryLevels: [0,1,2,3,4,5],
    sortOrder: 'due_date',
    limit: 50,
  });
  this.sessionStore.startSession(queue, this.collectionId);
  this.router.navigate(['/review/player']);
}
```

### Bottom nav
The "Review" tab in the bottom nav now navigates to `/review` (the hub), not directly to the player.

---

## Files to create

| File | Purpose |
|---|---|
| `src/app/features/review/services/review-filter.service.ts` | Card filtering and queue building |
| `src/app/features/review/pages/review-hub/review-hub.page.ts/.html/.scss` | Screen 11 |
| `src/app/features/review/pages/custom-study/custom-study.page.ts/.html/.scss` | Screen 11a |
| `src/app/features/review/pages/mastery-breakdown/mastery-breakdown.page.ts/.html/.scss` | Screen 11b |
| `src/app/features/review/pages/session-history/session-history.page.ts/.html/.scss` | Screen 11c |
| `src/app/features/review/pages/struggling-cards/struggling-cards.page.ts/.html/.scss` | Screen 11d |
| `src/app/shared/components/donut-chart/donut-chart.component.ts` | SVG donut for the hub hero |

## Files to modify

| File | Change |
|---|---|
| `src/app/features/review/review.routes.ts` | Rewrite with 7 child routes |
| `src/app/features/home/pages/home/home.page.ts` | "Review cards" navigates to `/review` not `/review/player` |
| `src/app/features/vault/pages/collection-detail/collection-detail.page.ts` | "Review" button uses `ReviewFilterService.buildQueue()` |
| `src/app/app.routes.ts` | Ensure `/review` lazy-loads the review module |

---

## Acceptance criteria

### AC-1 — Review Hub (screen 11)
- [ ] "Review" tab in bottom nav opens the Review Hub (not the player directly)
- [ ] Due donut shows correct mastery-level distribution of due cards with correct colours
- [ ] Due count in the donut centre matches the actual count of cards where `nextDueAt <= now`
- [ ] Mastery breakdown tags (new / hard / learning / review) show correct counts
- [ ] "Start today's review" builds a queue of all due cards sorted by due date and starts the player
- [ ] "Struggling cards" preset navigates to `/review/struggling`
- [ ] "New cards only" preset builds a queue of mastery-0 cards and starts the player immediately
- [ ] "Custom study" preset navigates to `/review/custom`
- [ ] "See all →" navigates to `/review/history`
- [ ] Recent sessions show the 2 most recent completed sessions with correct avg rating and metadata

### AC-2 — Custom Study Builder (screen 11a)
- [ ] Source picker shows "All collections" by default; tapping opens collection picker sheet
- [ ] Mastery grid shows 6 cards (levels 0–5) with correct dot colours and per-level card counts
- [ ] Tapping a mastery card toggles its selection (multi-select); selected cards have brand border
- [ ] Sort chips: only one active at a time; "Hardest first" is default
- [ ] Card limit slider ranges from 10 to 100, step 5; updates the preview count live
- [ ] Preview count bar shows the correct count of cards matching the current filters
- [ ] "Start session" builds the filtered queue and navigates to the player
- [ ] If no cards match: toast "No cards match your filters" and button stays disabled
- [ ] Deselecting all mastery levels: preview shows 0 and button is disabled

### AC-3 — Mastery Breakdown (screen 11b)
- [ ] Shows 6 horizontal bars (mastery 5 at top, 0 at bottom) with correct widths proportional to card count
- [ ] Each bar uses the correct mastery colour
- [ ] Bar widths animate on page load (600ms ease transition)
- [ ] Play button on each row starts a review session filtered to that mastery level
- [ ] Collection selector updates all bars and counts when changed
- [ ] "All collections" shows total counts across all collections

### AC-4 — Session History (screen 11c)
- [ ] Shows all completed sessions, newest first
- [ ] Each session card shows: title, date, avg rating pill (colour-coded), and 4 stat cells
- [ ] Avg rating pill: green background for ≥ 4.0, amber for 3.0–3.9, red for < 3.0
- [ ] "Cards" shows `totalCards`, "Duration" shows `MM:SS`, "Struggled" shows count of ratings ≤ 2, "Nailed" shows count of rating = 5
- [ ] Filter chips work: "This week" shows last 7 days, "This month" shows last 30 days
- [ ] Empty state: "No review sessions yet. Start your first review!" with CTA button

### AC-5 — Struggling Cards (screen 11d)
- [ ] Warning banner shows the correct count of struggling cards
- [ ] Cards are sorted by fail count descending (most failed first)
- [ ] Each card shows article-coloured background tint (same as vault list)
- [ ] Fail count badge: red for 4+ fails, amber for 3 fails
- [ ] "Last reviewed" and "Avg rating" metadata are accurate per card
- [ ] "Review all N struggling cards" button builds queue and starts session
- [ ] If no struggling cards: show empty state "No struggling cards! You're doing great 🎉"

### AC-6 — Integration
- [ ] Home screen "Review cards" button navigates to `/review` (the hub)
- [ ] Collection detail "Review (N)" button builds a filtered queue for that collection only
- [ ] After completing a session and returning to the hub: due counts update immediately
- [ ] Bottom nav "Review" tab always returns to the hub, never the player

### AC-7 — Review Filter Service
- [ ] `buildQueue({ source: 'all', masteryLevels: [0,1,2,3,4,5], sortOrder: 'due_date', limit: 50 })` returns only due cards, sorted by due date, limited to 50
- [ ] `buildQueue({ source: 'col-001', masteryLevels: [0], sortOrder: 'random', limit: 20 })` returns only new cards from collection col-001, randomly sorted, max 20
- [ ] `getMasteryDistribution()` returns correct counts per level
- [ ] `getStrugglingCards()` returns only cards at mastery 0-1 with repetitions > 0
- [ ] Changing the source collection correctly scopes all counts

---

## Non-goals (out of scope for this ticket)

- FSRS algorithm upgrade (future Epic 4 — the filtering system is algorithm-agnostic)
- Reviewing in reverse (back → front) mode
- Cloze / fill-the-gap review mode (Epic 3)
- Sharing custom study presets between users
- Scheduled review reminders / push notifications
- AI-powered "smart mix" that auto-composes the optimal daily queue