import { inject, Injectable } from '@angular/core';
import { Card, MasteryLevel } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import {
  ReviewFilters,
  ReviewLimit,
  ReviewPreset,
  ReviewPresetId,
  ReviewSortOrder,
  ReviewSource,
  SESSION_COLOUR_BAD,
  STRUGGLING_MASTERY_MAX,
} from '../models/review.model';

export type { ReviewFilters, ReviewPreset };

@Injectable({ providedIn: 'root' })
export class ReviewFilterService {
  private readonly cardStore = inject(CardStore);

  readonly presets: ReviewPreset[] = [
    {
      id: ReviewPresetId.DUE_TODAY,
      label: 'Due today',
      description: 'All cards due for review right now',
      iconName: 'calendar-outline',
      colour: 'var(--lc-brand)',
      filters: {
        source: ReviewSource.ALL,
        masteryLevels: [0, 1, 2, 3, 4, 5],
        sortOrder: ReviewSortOrder.DUE_DATE,
        limit: ReviewLimit.DUE_TODAY,
      },
    },
    {
      id: ReviewPresetId.STRUGGLING,
      label: 'Struggling cards',
      description: "Cards you've failed 3+ times",
      iconName: 'alert-circle-outline',
      colour: SESSION_COLOUR_BAD,
      filters: {
        source: ReviewSource.ALL,
        masteryLevels: [0, 1, 2],
        sortOrder: ReviewSortOrder.MOST_LAPSES,
        limit: ReviewLimit.STRUGGLING,
      },
    },
    {
      id: ReviewPresetId.NEW_ONLY,
      label: 'New cards only',
      description: 'Never-reviewed vocabulary',
      iconName: 'add-circle-outline',
      colour: 'var(--lc-accent)',
      filters: {
        source: ReviewSource.ALL,
        masteryLevels: [0],
        sortOrder: ReviewSortOrder.RANDOM,
        limit: ReviewLimit.NEW_ONLY,
      },
    },
  ];

  buildQueue(filters: ReviewFilters): Card[] {
    const now = new Date();
    let cards = [...this.cardStore.cards()];

    if (filters.source !== ReviewSource.ALL) {
      cards = cards.filter(c => c.collectionId === filters.source);
    }

    cards = cards.filter(c =>
      filters.masteryLevels.includes((c.srsState?.masteryLevel ?? 0) as MasteryLevel)
    );

    if (filters.sortOrder === ReviewSortOrder.DUE_DATE) {
      // Include: overdue reviewed cards (masteryLevel > 0, nextDueAt <= now)
      //          AND new cards (masteryLevel === 0, never studied)
      cards = cards.filter(c => {
        const level = c.srsState?.masteryLevel ?? 0;
        if (level === 0) return true; // new card — always include in today's session
        return c.srsState && new Date(c.srsState.nextDueAt) <= now;
      });
    }

    if (filters.sortOrder === ReviewSortOrder.MOST_LAPSES) {
      cards = cards.filter(c => {
        const s = c.srsState;
        const level = s?.masteryLevel ?? 0;
        return s && s.repetitions > 0 && level >= 1 && level <= STRUGGLING_MASTERY_MAX;
      });
    }

    cards = this.sortCards(cards, filters.sortOrder);
    return cards.slice(0, filters.limit);
  }

  private sortCards(cards: Card[], order: ReviewSortOrder): Card[] {
    switch (order) {
      case ReviewSortOrder.HARDEST:
        return [...cards].sort((a, b) =>
          (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0)
        );
      case ReviewSortOrder.OLDEST:
        return [...cards].sort((a, b) => {
          const aDate = a.srsState?.lastReviewedAt ?? a.createdAt;
          const bDate = b.srsState?.lastReviewedAt ?? b.createdAt;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        });
      case ReviewSortOrder.DUE_DATE:
        // Overdue cards first (smallest nextDueAt), then new cards (no nextDueAt → pushed to end)
        return [...cards].sort((a, b) => {
          const aTs = a.srsState?.nextDueAt ? new Date(a.srsState.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bTs = b.srsState?.nextDueAt ? new Date(b.srsState.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER;
          return aTs - bTs;
        });
      case ReviewSortOrder.MOST_LAPSES:
        // Sort by repetitions descending: more review cycles at low mastery = most stuck
        return [...cards].sort((a, b) =>
          (b.srsState?.repetitions ?? 0) - (a.srsState?.repetitions ?? 0)
        );
      case ReviewSortOrder.RANDOM:
        return [...cards].sort(() => Math.random() - 0.5);
      default:
        return cards;
    }
  }

  getMasteryDistribution(collectionId?: string): Record<MasteryLevel, number> {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MasteryLevel, number>;
    cards.forEach(c => {
      const level = (c.srsState?.masteryLevel ?? 0) as MasteryLevel;
      dist[level]++;
    });
    return dist;
  }

  // Cards that have been reviewed at least once and whose next review date has passed.
  // New (masteryLevel=0) cards are tracked separately via getNewCount().
  getDueTodayCount(collectionId?: string): number {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c =>
      c.srsState &&
      (c.srsState.masteryLevel ?? 0) > 0 &&
      new Date(c.srsState.nextDueAt) <= now
    ).length;
  }

  getDueTodayByMastery(collectionId?: string): Record<MasteryLevel, number> {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const due = cards.filter(c =>
      c.srsState &&
      (c.srsState.masteryLevel ?? 0) > 0 &&
      new Date(c.srsState.nextDueAt) <= now
    );
    const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MasteryLevel, number>;
    due.forEach(c => {
      const level = (c.srsState?.masteryLevel ?? 0) as MasteryLevel;
      dist[level]++;
    });
    return dist;
  }

  getStrugglingCards(limit: number = ReviewLimit.STRUGGLING): Card[] {
    return this.cardStore.cards()
      .filter(c => {
        const s = c.srsState;
        const level = s?.masteryLevel ?? 0;
        return s && s.repetitions > 0 && level >= 1 && level <= STRUGGLING_MASTERY_MAX;
      })
      .sort((a, b) => (a.srsState?.repetitions ?? 0) - (b.srsState?.repetitions ?? 0))
      .slice(0, limit);
  }

  getStrugglingCount(): number {
    return this.cardStore.cards().filter(c => {
      const s = c.srsState;
      const level = s?.masteryLevel ?? 0;
      return s && s.repetitions > 0 && level >= 1 && level <= STRUGGLING_MASTERY_MAX;
    }).length;
  }

  getNewCount(collectionId?: string): number {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c => (c.srsState?.masteryLevel ?? 0) === 0).length;
  }
}

