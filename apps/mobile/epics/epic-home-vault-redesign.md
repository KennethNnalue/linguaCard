# Epic: Home, Vault & Word Card Redesign

**Epic ID:** LC-RD
**Status:** Planning
**Design Reference:** `redesign-reference.html` — screens R01, R01b, R02, R03
**Depends on:** DS-01 (tokens), DS-03 (utils) from the Design System epic
**Goal:** Transform the Home dashboard, Vault word list, and Word Detail page from flat data displays into rich, motivating, context-dense learning interfaces that drive daily engagement and accelerate vocabulary acquisition.

---

## Research Summary

### Problems identified

| Screen | Problem | Evidence |
|--------|---------|----------|
| **Home** | Passive stats display — "0 day streak, 380 words, 0 mastered" is demoralizing, not motivating | Users see numbers but have no clear action to take; no daily goal framing |
| **Home** | No learning content between sessions — the home screen is a dead end once you've reviewed | Competing apps (Duolingo, Memrise) surface passive learning content on the home screen |
| **Home** | No visibility into learning patterns over time | Users can't see if they're improving or slipping |
| **Vault** | Word cards are empty — only show word + translation, wasting 60% of card space | Users must tap into detail view to see any useful context (examples, mastery, category) |
| **Vault** | Filter UX is cramped — der/die/das pills compete with category filters in a single row | Article filters and learning-state filters serve different needs but are conflated visually |
| **Vault** | No mastery-based filtering — can't see "words I'm struggling with" or "words due now" | The most learning-relevant filter dimension is entirely absent |
| **Word Detail** | Flat divider-separated layout — no visual hierarchy between sections | All sections look the same; mastery stats are tiny info cells lost in the page |
| **Word Detail** | No actionable CTA — users view a word but can't do anything with it | No "Review this word" or "Add to collection" actions from the detail view |
| **Word Detail** | No related words — missed opportunity to build word-family connections | Learners benefit from seeing der Kater / das Kätzchen alongside die Katze |

### Design principles applied

1. **Action-first** — Every screen leads with what the user should *do next*, not just what they have
2. **Context density** — Show enough information to learn from the list view without extra taps
3. **Visual mastery feedback** — Color-coded mastery bars, rings, and dots create instant state recognition
4. **Card-based grouping** — Related information lives in visually distinct cards, reducing cognitive load
5. **Progressive disclosure** — Most important info (word, translation, mastery) is always visible; details (phonetic, interval, examples) are secondary

---

## Phase 1 — Vault Word Card Redesign

The word card is the atomic unit of the entire app. Improving it has the highest compound impact since it appears in the vault list, home recent words, collection detail, and search results.

---

### LC-RD01 · Rich word card component

**Phase:** 1 — Word Card
**Points:** 5
**Depends on:** DS-04 (article-badge), DS-05 (mastery-dot)

#### User story

As a language learner, I want each word in my vault list to show the example sentence, mastery level, review interval, and category at a glance, so that I can learn from scanning the list and quickly identify which words need attention.

#### Design reference

Open `redesign-reference.html`, screen R02. Each word card shows:

```
┌─────────────────────────────────────────────────┐
│▌ [der] Zug  /tsuːk/                            │
│▌ the train                          [TRAVEL]    │
│▌ "Der Zug fährt um 8 Uhr ab."                  │
│▌ ● New  · Due                    [🔊]          │
└─────────────────────────────────────────────────┘
 ↑ mastery color bar (4px left strip)
```

#### Component structure

```
apps/mobile/src/app/shared/ui/word-card/
├── word-card.component.ts
├── word-card.component.html
└── word-card.component.scss
```

#### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `card` | `Card` | The full card domain object |
| `categoryName` | `string` | Resolved category display name |
| `compact` | `boolean` | If true, hides example row (for home recent list) |

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `cardClick` | `void` | Navigates to word detail |
| `playAudio` | `void` | Triggers pronunciation playback |

#### HTML template

```html
<div class="wc-card" (click)="cardClick.emit()" [attr.data-mastery]="masteryLevel()">
  <div class="wc-inner">
    <div class="wc-mastery-bar" [style.background]="masteryColor()"></div>
    <div class="wc-content">
      
      <!-- Row 1: article + word + phonetic -->
      <div class="wc-top">
        @if (card().content.article) {
          <lc-article-badge [article]="card().content.article" size="sm"/>
        }
        <span class="wc-word lc-display">{{ card().content.back }}</span>
        @if (card().content.phonetic) {
          <span class="wc-phonetic">{{ card().content.phonetic }}</span>
        }
      </div>
      
      <!-- Row 2: translation + category -->
      <div class="wc-mid">
        <span class="wc-trans">{{ card().content.front }}</span>
        @if (categoryName()) {
          <span class="lc-word-tag">{{ categoryName() }}</span>
        }
      </div>
      
      <!-- Row 3: example sentence preview (unless compact) -->
      @if (!compact() && firstExample()) {
        <p class="wc-example" [innerHTML]="highlightedExample()"></p>
      }
      
      <!-- Row 4: mastery + interval + due badge + audio action -->
      <div class="wc-bottom">
        <div class="wc-mastery-pill">
          <lc-mastery-dot [level]="masteryLevel()" size="sm"/>
          <span>{{ masteryLabel() }}</span>
        </div>
        @if (isDue()) {
          <span class="wc-due">Due</span>
        } @else if (intervalText()) {
          <span class="wc-interval">{{ intervalText() }}</span>
        }
        <div class="wc-spacer"></div>
        <button class="wc-action" (click)="onPlayAudio($event)" aria-label="Play pronunciation">
          <ion-icon name="volume-high-outline"></ion-icon>
        </button>
      </div>
      
    </div>
  </div>
</div>
```

#### Key computed signals

```typescript
readonly masteryLevel = computed(() => this.card().srsState?.masteryLevel ?? 0);

readonly masteryColor = computed(() =>
  ['#D1D5DB','#FCA5A5','#FCD34D','#6EE7B7','#34D399','#059669'][this.masteryLevel()]
);

readonly masteryLabel = computed(() => {
  const state = this.card().srsState?.state;
  if (!state || state === 'new') return 'New';
  return { learning: 'Learning', review: 'Review', mastered: 'Mastered' }[state] ?? 'New';
});

readonly isDue = computed(() => {
  const next = this.card().srsState?.nextDueAt;
  return !next || new Date(next).getTime() <= Date.now();
});

readonly intervalText = computed(() => {
  const days = this.card().srsState?.intervalDays ?? 0;
  return days > 0 ? `${days}d interval` : '';
});

readonly firstExample = computed(() => this.card().content.examples[0] ?? null);

readonly highlightedExample = computed(() => {
  const ex = this.firstExample();
  if (!ex) return '';
  const word = this.card().content.back;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ex.target.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
});
```

#### SCSS structure

```scss
@use 'theme/tokens' as t;
@use 'theme/utils' as u;

.wc-card {
  @include u.lc-card(t.$lc-radius-md + 2);
  overflow: hidden;
  cursor: pointer;
  @include u.touch-state;
}

.wc-inner {
  display: flex;
  gap: 0;
}

.wc-mastery-bar {
  width: t.$lc-space-1;
  flex-shrink: 0;
  border-radius: 2px 0 0 2px;
}

.wc-content {
  flex: 1;
  padding: t.$lc-space-3 t.$lc-space-3 t.$lc-space-2;
  min-width: 0;
}

.wc-top {
  display: flex;
  align-items: center;
  gap: t.$lc-space-1 + 2;
  margin-bottom: t.$lc-space-1 - 1;
}

.wc-word {
  @include u.lc-font('xl', t.$lc-font-weight-semibold);
  color: t.$lc-text-primary;
  line-height: 1.2;
}

.wc-phonetic {
  font-family: t.$lc-font-mono;
  @include u.lc-font('xxs');
  color: t.$lc-text-hint;
  margin-left: t.$lc-space-1 / 2;
}

.wc-mid {
  display: flex;
  align-items: center;
  gap: t.$lc-space-1 + 2;
  margin-bottom: t.$lc-space-1 + 2;
}

.wc-trans {
  @include u.lc-font('sm');
  color: t.$lc-text-secondary;
  flex: 1;
  @include u.text-overflow;
}

.wc-example {
  @include u.lc-font('xs');
  color: t.$lc-text-hint;
  font-style: italic;
  line-height: 1.4;
  @include u.text-overflow;
  margin-bottom: t.$lc-space-1 + 2;

  strong {
    color: t.$lc-brand;
    font-style: normal;
  }
}

.wc-bottom {
  display: flex;
  align-items: center;
  gap: t.$lc-space-2;
}

.wc-mastery-pill {
  display: flex;
  align-items: center;
  gap: t.$lc-space-1;
  @include u.lc-font('xxs', t.$lc-font-weight-semibold);
  color: t.$lc-text-hint;
}

.wc-due {
  @include u.lc-font('xxs', t.$lc-font-weight-bold);
  color: t.$lc-accent;
  background: t.$lc-accent-light;
  padding: 2px t.$lc-space-1 + 2;
  border-radius: t.$lc-radius-full;
}

.wc-interval {
  @include u.lc-font('xxs');
  color: t.$lc-text-hint;
}

.wc-spacer { flex: 1; }

.wc-action {
  @include u.square(26px);
  border-radius: t.$lc-radius-sm;
  background: var(--lc-surface);
  border: 1px solid var(--lc-border);
  @include u.flex-center;
  cursor: pointer;

  ion-icon {
    font-size: 14px;
    color: t.$lc-text-secondary;
  }
}
```

#### Acceptance criteria

- [ ] Word card renders article badge, word, phonetic, translation, category tag, example preview, mastery pill, interval, due badge, and audio button
- [ ] Mastery bar on the left edge matches the mastery level color (0–5 scale)
- [ ] Example sentence has the target word highlighted in `<strong>` with brand color
- [ ] "Due" badge shown in accent orange when `nextDueAt <= now`
- [ ] Audio button stops event propagation and emits `playAudio` without navigating
- [ ] `compact` input hides the example row (for use in home recent list)
- [ ] Card has touch-state feedback (scale 0.97 on press)
- [ ] All values use LDS tokens — zero raw hex, px, or font-family values
- [ ] Card renders correctly for words with no article (verbs, adjectives) — article badge is conditionally hidden

---

### LC-RD02 · Replace vault word list with rich word card

**Phase:** 1 — Word Card
**Points:** 3
**Depends on:** LC-RD01

#### User story

As a language learner browsing my vault, I want to see the new rich word cards instead of the old flat items, so that I can assess each word's context and mastery without tapping into the detail view.

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/vault/vault.page.html` | Replace `word-item` divs with `<lc-word-card>` component |
| `features/vault/pages/vault/vault.page.ts` | Import `WordCardComponent`, wire `cardClick` to router, wire `playAudio` to `PronunciationService` |
| `features/vault/pages/vault/vault.page.scss` | Remove old `.word-item` styles, adjust `.word-list` gap to 8px |

#### Acceptance criteria

- [ ] Vault "All words" view renders `<lc-word-card>` for each card
- [ ] Tapping a card navigates to `/vault/:id` (word detail)
- [ ] Audio button plays pronunciation without navigating
- [ ] Old `.word-item` styles are removed from vault SCSS
- [ ] Collection detail page also uses `<lc-word-card>` for its word list
- [ ] Visual output matches screen R02 in `redesign-reference.html`

---

## Phase 2 — Vault Filter & Search Redesign

---

### LC-RD03 · Mastery-based filter chips

**Phase:** 2 — Vault Filters
**Points:** 3
**Depends on:** LC-RD02

#### User story

As a language learner, I want to filter my vault by learning state (All, Due now, New, Learning, Mastered), so that I can focus on the words that need the most attention.

#### Design reference

Screen R02, filter row:

```
[All 380] [Due now] [New] [Mastered]   Sort ▾
```

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/vault/vault.page.html` | Replace category chip row with mastery filter chips + sort dropdown |
| `features/vault/pages/vault/vault.page.ts` | Add `activeFilter` signal, computed `filteredCards` with mastery-based filtering |
| `features/vault/pages/vault/vault.page.scss` | New `.v2-filter-row`, `.v2-filter-chip` styles |
| `features/vault/store/card.store.ts` | Add `cardsDueNow`, `cardsNew`, `cardsMastered` computed signals if not present |

#### Filter logic

```typescript
readonly activeFilter = signal<'all' | 'due' | 'new' | 'learning' | 'mastered'>('all');

readonly filteredCards = computed(() => {
  const cards = this.sortedCards();
  switch (this.activeFilter()) {
    case 'due':
      return cards.filter(c => !c.srsState?.nextDueAt || new Date(c.srsState.nextDueAt) <= new Date());
    case 'new':
      return cards.filter(c => !c.srsState || c.srsState.state === 'new');
    case 'learning':
      return cards.filter(c => c.srsState?.state === 'learning');
    case 'mastered':
      return cards.filter(c => c.srsState?.state === 'mastered');
    default:
      return cards;
  }
});
```

#### Acceptance criteria

- [ ] Filter row shows: All (with count), Due now, New, Mastered chips
- [ ] Active chip has brand-green background + white text
- [ ] Inactive chips have card background + secondary text
- [ ] Tapping a chip updates the word list immediately (no loading state needed — client-side filter)
- [ ] "All" chip shows total card count in a count badge
- [ ] Filter state resets to "All" when navigating away and back

---

### LC-RD04 · Redesigned article legend row

**Phase:** 2 — Vault Filters
**Points:** 1
**Depends on:** LC-RD03

#### User story

As a language learner, I want the der/die/das article indicators to be a subtle legend below the filter chips, so that I can filter by gender without the legend dominating the screen.

#### Design reference

Screen R02, article legend row:

```
● der   ● die   ● das              ↓ Newest
```

Small colored dots + labels that act as toggleable filters. Sort indicator on the far right.

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/vault/vault.page.html` | Replace `.art-legend` with `.v2-article-legend` row |
| `features/vault/pages/vault/vault.page.scss` | New `.v2-art-pill`, `.v2-art-dot` styles |
| `features/vault/pages/vault/vault.page.ts` | Existing article filter logic unchanged, just new template |

#### Acceptance criteria

- [ ] Article legend renders below filter chips as small dot + label pills
- [ ] Active article filter pill has a subtle border + card background
- [ ] Tapping a pill toggles the article filter (existing behavior, new look)
- [ ] Sort indicator on the far right shows current sort direction + label
- [ ] Layout is single-line, not wrapping

---

### LC-RD05 · Sort dropdown

**Phase:** 2 — Vault Filters
**Points:** 2
**Depends on:** LC-RD03

#### User story

As a language learner, I want a sort dropdown in the filter row to choose between sort modes (Newest, Alphabetical, Mastery, Due date), so that I can organize my vault for different study goals.

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/vault/vault.page.html` | Add sort dropdown button in filter row |
| `features/vault/pages/vault/vault.page.ts` | Add `sortMode` signal, `sortedCards` computed with 4 sort modes |
| `features/vault/pages/vault/vault.page.scss` | `.v2-filter-dropdown` styles |

#### Sort modes

```typescript
type VaultSortMode = 'newest' | 'alphabetical' | 'mastery' | 'due-date';

readonly sortMode = signal<VaultSortMode>('newest');

readonly sortedCards = computed(() => {
  const cards = [...this.cardStore.cards()];
  switch (this.sortMode()) {
    case 'alphabetical':
      return cards.sort((a, b) => a.content.back.localeCompare(b.content.back, 'de'));
    case 'mastery':
      return cards.sort((a, b) => (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0));
    case 'due-date':
      return cards.sort((a, b) => {
        const aDate = a.srsState?.nextDueAt ? new Date(a.srsState.nextDueAt).getTime() : 0;
        const bDate = b.srsState?.nextDueAt ? new Date(b.srsState.nextDueAt).getTime() : 0;
        return aDate - bDate;
      });
    default: // newest
      return cards.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
});
```

#### Acceptance criteria

- [ ] Sort dropdown button in filter row shows current sort mode label
- [ ] Tapping opens an `ion-action-sheet` with 4 sort options
- [ ] Selecting a sort mode updates the list immediately
- [ ] Sort mode persists within the session (signal state)
- [ ] "Mastery" sort shows lowest mastery first (struggling words at the top)
- [ ] "Due date" sort shows overdue cards first

---

## Phase 3 — Home Dashboard Redesign

---

### LC-RD06 · Today's learning hero card with ring progress

**Phase:** 3 — Home
**Points:** 5
**Depends on:** LC-RD01

#### User story

As a language learner opening the app, I want to see a motivating hero card showing how many cards are due today with a visual progress ring and a "Start session" button, so that I immediately know what to do and feel motivated by visual progress.

#### Design reference

Screen R01, hero card:

```
┌──────────────────────────────────────────┐
│  GOOD MORNING                            │
│  Ready to learn today?                   │
│                                          │
│  [◯ 376]   295 new cards                │
│  [ due ]    81 reviews                   │
│             All collections              │
│                                          │
│  [▶ Start session]  [≡ Filter]           │
└──────────────────────────────────────────┘
```

Circular SVG progress ring fills as the user completes reviews during the day.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Replace `.hero` card with `.h2-today` card, ring SVG, new CTAs |
| `features/home/pages/home/home.page.ts` | Add `dueToday`, `newToday`, `reviewToday`, `completedToday`, `ringOffset` computed signals |
| `features/home/pages/home/home.page.scss` | New `.h2-today`, `.h2-ring-*` styles |

#### Ring progress calculation

```typescript
readonly totalDue = computed(() => {
  const cards = this.cardStore.cards();
  return cards.filter(c =>
    !c.srsState?.nextDueAt || new Date(c.srsState.nextDueAt) <= new Date()
  ).length;
});

readonly completedToday = computed(() =>
  this.reviewStore.todaySessionCount() // reviews completed today
);

readonly ringProgress = computed(() => {
  const total = this.totalDue() + this.completedToday();
  if (total === 0) return 0;
  return this.completedToday() / total;
});

// SVG stroke-dashoffset for the ring
readonly ringOffset = computed(() => {
  const circumference = 2 * Math.PI * 28; // r=28
  return circumference * (1 - this.ringProgress());
});
```

#### Time-based greeting

```typescript
readonly greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
});
```

#### Acceptance criteria

- [ ] Hero card has dark brand gradient background with subtle circle decorations
- [ ] Greeting updates based on time of day (morning/afternoon/evening)
- [ ] Circular SVG ring shows progress: `stroke-dashoffset` animates as reviews complete
- [ ] Ring center shows due count in display font
- [ ] Right side shows breakdown: N new cards + N reviews
- [ ] "Start session" primary CTA button navigates to `/review`
- [ ] "Filter" ghost button opens collection picker action sheet
- [ ] Ring fills progressively during the day as reviews are completed
- [ ] Ring shows 100% (full green) when all due cards are reviewed

---

### LC-RD07 · Streak + stats row with weekly dots

**Phase:** 3 — Home
**Points:** 2
**Depends on:** LC-RD06

#### User story

As a language learner, I want to see my day streak with visual dots showing the last 7 days, total words, and mastered count in compact stat cards, so that I feel motivated by my consistency and progress.

#### Design reference

Screen R01, stats row — three cards showing streak (with 7 day dots), word count, and mastered count.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Replace `.stats-row` with `.h2-stats` row including streak dots |
| `features/home/pages/home/home.page.ts` | Add `streakDays` computed, `last7DaysActive` computed array |
| `features/home/pages/home/home.page.scss` | New `.h2-stat`, `.h2-streak-dots` styles |

#### Acceptance criteria

- [ ] Three stat cards in a row: streak, words, mastered
- [ ] Streak card shows a row of 7 dots (last 7 days) — active days in accent orange, inactive in border gray
- [ ] Word count shows total cards in vault
- [ ] Mastered count shows cards with `srsState.state === 'mastered'`
- [ ] Cards have consistent sizing and shadow per LDS tokens

---

### LC-RD08 · Word of the Day card

**Phase:** 3 — Home
**Points:** 3
**Depends on:** LC-RD06

#### User story

As a language learner, I want to see a "Word of the Day" card on my home screen showing a random vocabulary word with its translation, grammatical info, and example sentence, so that I can learn passively even when I don't start a formal review session.

#### Design reference

Screen R01, Word of the Day card with accent-colored left border, play button, and example sentence.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Add `.h2-wotd` card below stats |
| `features/home/pages/home/home.page.ts` | Add `wordOfTheDay` computed signal, `playWotd()` method |
| `features/home/pages/home/home.page.scss` | New `.h2-wotd-*` styles |

#### Word selection logic

```typescript
readonly wordOfTheDay = computed(() => {
  const cards = this.cardStore.cards();
  if (cards.length === 0) return null;
  // Deterministic daily selection using date as seed
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return cards[dayIndex % cards.length];
});
```

#### Acceptance criteria

- [ ] Card shows a word from the vault, changing daily (deterministic, not random on each render)
- [ ] Displays: word (in display font), translation, grammatical info (article + word type), example sentence
- [ ] Accent-colored (orange) left border strip distinguishes it from other cards
- [ ] Play button triggers TTS pronunciation
- [ ] Example sentence has the target word in bold brand color
- [ ] Card is hidden when the vault is empty (no empty state needed)
- [ ] "✦ Word of the Day" label in accent color

---

### LC-RD09 · Weekly progress bar chart

**Phase:** 3 — Home
**Points:** 3
**Depends on:** LC-RD07

#### User story

As a language learner, I want to see a compact bar chart showing how many cards I reviewed each day this week, so that I can identify my learning patterns and stay accountable to my goals.

#### Design reference

Screen R01b, "This week" section with 7 vertical bars, today highlighted in accent color.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Add `.h2-weekly` card in scrolled home content |
| `features/home/pages/home/home.page.ts` | Add `weeklyData` computed signal from review history |
| `features/home/pages/home/home.page.scss` | New `.h2-weekly-*` styles |

#### Data source

```typescript
// Derive from existing review session history
readonly weeklyData = computed(() => {
  const sessions = this.reviewStore.sessionHistory();
  const today = new Date();
  const days = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  return days.map((label, i) => {
    const date = new Date(today);
    const currentDayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
    date.setDate(today.getDate() - currentDayOfWeek + i);
    const dateStr = date.toISOString().split('T')[0];

    const count = sessions
      .filter(s => s.completedAt?.startsWith(dateStr))
      .reduce((sum, s) => sum + s.cardsReviewed, 0);

    return { label, count, isToday: i === currentDayOfWeek };
  });
});
```

#### Acceptance criteria

- [ ] 7 vertical bars representing Monday–Sunday of the current week
- [ ] Bar height is proportional to review count (tallest bar = 100% of available height)
- [ ] Completed days use brand-green fill; today uses accent-orange fill; future days use brand-light
- [ ] Day labels below each bar in uppercase
- [ ] Today's label is in accent color
- [ ] Legend below shows "N cards reviewed" total and weekly goal
- [ ] Chart handles zero-review days gracefully (minimum bar height of 4px)

---

### LC-RD10 · Quick actions row

**Phase:** 3 — Home
**Points:** 2
**Depends on:** LC-RD06

#### User story

As a language learner, I want quick action tiles on my home screen for common tasks (Scan/Import, Generate Story, Listen), so that I can start any learning activity in one tap without navigating through tabs.

#### Design reference

Screen R01b, "Quick actions" — three tile cards with emoji icon + label + subtitle.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Add `.h2-actions` row below weekly chart |
| `features/home/pages/home/home.page.ts` | Add navigation methods for each action |
| `features/home/pages/home/home.page.scss` | New `.h2-action` styles |

#### Acceptance criteria

- [ ] Three action tiles: Scan (navigates to image import), Story (navigates to story generation), Listen (navigates to listen page)
- [ ] Each tile has emoji icon, primary label, and secondary subtitle
- [ ] Touch state: scale 0.96 on press
- [ ] Tiles navigate to the correct feature route on tap

---

### LC-RD11 · Recent words section using rich word card

**Phase:** 3 — Home
**Points:** 2
**Depends on:** LC-RD01, LC-RD06

#### User story

As a language learner, I want to see my most recently added words on the home screen with compact word cards, so that I'm reminded of new vocabulary and can quickly access words I just added.

#### Design reference

Screen R01b, "Recently added" section — 3 compact word cards with mastery bar, word, translation, category tag.

#### Files to modify

| File | Change |
|------|--------|
| `features/home/pages/home/home.page.html` | Replace `.word-list` in home with `<lc-word-card compact>` components |
| `features/home/pages/home/home.page.ts` | Add `recentCards` computed signal (last 3 by createdAt) |

#### Acceptance criteria

- [ ] Shows the 3 most recently added cards
- [ ] Uses `<lc-word-card [compact]="true">` which hides the example row
- [ ] "See all →" link navigates to `/vault`
- [ ] Section is hidden when vault has 0 cards
- [ ] Cards navigate to word detail on tap

---

## Phase 4 — Word Detail Redesign

---

### LC-RD12 · Card-based word detail layout

**Phase:** 4 — Word Detail
**Points:** 5
**Depends on:** LC-RD01

#### User story

As a language learner viewing a word's detail page, I want information grouped in distinct visual cards (header, mastery, examples, notes, related words) with a mastery ring and actionable CTAs, so that I can understand my progress and take immediate action to review the word.

#### Design reference

Screen R03 — Word Detail with card-based sections.

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/word-detail/word-detail.component.html` | Replace flat layout with card-based sections per design |
| `features/vault/pages/word-detail/word-detail.component.scss` | New `.wd2-*` styles replacing old `.wd-*` styles |
| `features/vault/pages/word-detail/word-detail.component.ts` | Add `relatedWords` computed, `reviewThisWord()` method |

#### New sections

1. **Header card** — Article badge, word (28px display), phonetic, translation, status pills, Listen + Record audio buttons
2. **Mastery card** — SVG ring visualization (replaces flat progress bar), level label, next review date, 4-cell stats grid (reviews, avg rating, interval, last seen)
3. **Examples card** — Example sentences with highlighted target word, separated by dividers
4. **Notes card** — Accent-colored card with 💡 icon and tip text
5. **Related words card** — List of word-family items with article badges (new feature)
6. **Bottom actions** — "Review this word" primary CTA + Edit + Delete icon buttons

#### Related words (new feature)

```typescript
readonly relatedWords = computed(() => {
  const card = this.card();
  if (!card) return [];
  const word = card.content.back.toLowerCase();
  const allCards = this.cardStore.cards();

  // Simple substring matching for word families
  return allCards
    .filter(c => c.id !== card.id)
    .filter(c => {
      const other = c.content.back.toLowerCase();
      // Share a stem of 4+ characters
      return (other.includes(word.slice(0, 4)) || word.includes(other.slice(0, 4)))
        && Math.abs(other.length - word.length) <= 5;
    })
    .slice(0, 5);
});
```

#### "Review this word" action

```typescript
reviewThisWord(): void {
  const card = this.card();
  if (!card) return;
  this.reviewStore.startSession([card], null, null);
  this.navCtrl.navigateForward('/review');
}
```

#### Acceptance criteria

- [ ] Word detail renders 5 distinct card sections with rounded corners and shadows
- [ ] Mastery ring uses SVG with animated `stroke-dashoffset` matching the mastery level (0–5 mapped to 0–100%)
- [ ] Ring color matches mastery color scale
- [ ] Stats grid shows: total reviews, average rating, interval, last reviewed
- [ ] Examples section renders all example sentences with highlighted target word
- [ ] Notes section renders in accent-colored card with 💡 icon (only if notes exist)
- [ ] Related words section shows up to 5 words sharing a stem with the current word
- [ ] "Review this word" CTA starts a single-card review session
- [ ] Edit and Delete buttons are icon-only in the bottom actions bar
- [ ] Delete still shows the confirmation alert
- [ ] Page scrolls smoothly with all sections
- [ ] All styles use LDS tokens

---

## Phase 5 — Polish & Integration

---

### LC-RD13 · Vault search UX improvements

**Phase:** 5 — Polish
**Points:** 2
**Depends on:** LC-RD03

#### User story

As a language learner, I want the vault search to be visually prominent with a cleaner design and instant filtering as I type, so that I can find any word in my 380-word vault quickly.

#### Files to modify

| File | Change |
|------|--------|
| `features/vault/pages/vault/vault.page.html` | Update search bar markup to `.v2-search` design |
| `features/vault/pages/vault/vault.page.scss` | New `.v2-search` styles with larger touch target and cleaner icon |

#### Acceptance criteria

- [ ] Search bar has 12px padding, 12px border-radius, card background with shadow
- [ ] Search icon is 14px, hint text is 13px
- [ ] Search filters both `content.front` (English) and `content.back` (German)
- [ ] Results update instantly as the user types (existing debounced behavior maintained)
- [ ] Empty search state shows all cards (existing behavior)

---

### LC-RD14 · Update design-reference.html with new screens

**Phase:** 5 — Polish
**Points:** 1
**Depends on:** LC-RD12

#### User story

As a developer, I want the main `design-reference.html` file to include the redesigned Home, Vault, and Word Detail screens alongside the existing screens, so that all design decisions are documented in one place.

#### Files to modify

| File | Change |
|------|--------|
| `design-reference.html` | Add new screen sections for R01, R01b, R02, R03 from `redesign-reference.html`; merge CSS |

#### Acceptance criteria

- [ ] `design-reference.html` includes redesigned screens in a new "Redesign" section
- [ ] Old screens are preserved (not deleted) for reference
- [ ] All CSS from `redesign-reference.html` is merged into the main file's `<style>` block
- [ ] Phone mockups match the redesign reference pixel-for-pixel

---

## Story Dependency Graph

```
Phase 1 — Word Card
  LC-RD01 (Rich word card component)
    └── LC-RD02 (Replace vault word list)

Phase 2 — Vault Filters
  LC-RD03 (Mastery-based filter chips)
    ├── LC-RD04 (Article legend row)
    └── LC-RD05 (Sort dropdown)

Phase 3 — Home Dashboard
  LC-RD06 (Today's learning hero card)
    ├── LC-RD07 (Streak + stats row)
    │   └── LC-RD09 (Weekly progress chart)
    ├── LC-RD08 (Word of the Day)
    ├── LC-RD10 (Quick actions row)
    └── LC-RD11 (Recent words section)

Phase 4 — Word Detail
  LC-RD12 (Card-based word detail)

Phase 5 — Polish
  LC-RD13 (Vault search UX)
  LC-RD14 (Update design reference)
```

## Total Points

| Phase | Stories | Points |
|-------|---------|--------|
| 1 — Word Card | 2 | 8 |
| 2 — Vault Filters | 3 | 6 |
| 3 — Home Dashboard | 6 | 17 |
| 4 — Word Detail | 1 | 5 |
| 5 — Polish | 2 | 3 |
| **Total** | **14** | **39** |

## Implementation Notes

- **Phase 1 should land first** — the rich word card is reused in Home (LC-RD11), Vault (LC-RD02), and Collection Detail. It's the highest-leverage component.
- **Phase 2 and 3 can run in parallel** — vault filter work and home dashboard work are independent.
- **Phase 4 depends only on Phase 1** — the word detail redesign uses the mastery color logic from the word card.
- **All phases depend on DS-01 (tokens)** from the Design System epic. If tokens aren't merged yet, the SCSS can use raw values with TODO comments for migration.
