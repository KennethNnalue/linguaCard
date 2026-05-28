import { inject, Injectable } from '@angular/core';
import { Card, MasteryLevel } from '../../../core/models/mock-data';
import { CardStore } from '../../../core/store/card.store';

export interface ReviewFilters {
  source: 'all' | string;
  masteryLevels: MasteryLevel[];
  sortOrder: 'hardest' | 'oldest' | 'random' | 'due_date' | 'most_lapses';
  limit: number;
}

export interface ReviewPreset {
  id: string;
  label: string;
  description: string;
  iconName: string;
  colour: string;
  filters: ReviewFilters;
}

@Injectable({ providedIn: 'root' })
export class ReviewFilterService {
  private readonly cardStore = inject(CardStore);

  readonly presets: ReviewPreset[] = [
    {
      id: 'due-today',
      label: 'Due today',
      description: 'All cards due for review right now',
      iconName: 'calendar-outline',
      colour: 'var(--lc-brand)',
      filters: { source: 'all', masteryLevels: [0, 1, 2, 3, 4, 5], sortOrder: 'due_date', limit: 50 },
    },
    {
      id: 'struggling',
      label: 'Struggling cards',
      description: "Cards you've failed 3+ times",
      iconName: 'alert-circle-outline',
      colour: '#B91C1C',
      filters: { source: 'all', masteryLevels: [0, 1, 2], sortOrder: 'most_lapses', limit: 30 },
    },
    {
      id: 'new-only',
      label: 'New cards only',
      description: 'Never-reviewed vocabulary',
      iconName: 'add-circle-outline',
      colour: 'var(--lc-accent)',
      filters: { source: 'all', masteryLevels: [0], sortOrder: 'random', limit: 20 },
    },
  ];

  buildQueue(filters: ReviewFilters): Card[] {
    const now = new Date();
    let cards = [...this.cardStore.cards()];

    if (filters.source !== 'all') {
      cards = cards.filter(c => c.collectionId === filters.source);
    }

    cards = cards.filter(c =>
      filters.masteryLevels.includes((c.srsState?.masteryLevel ?? 0) as MasteryLevel)
    );

    if (filters.sortOrder === 'due_date') {
      cards = cards.filter(c => c.srsState && new Date(c.srsState.nextDueAt) <= now);
    }

    if (filters.sortOrder === 'most_lapses') {
      cards = cards.filter(c => {
        const s = c.srsState;
        return s && s.repetitions > 0 && (s.masteryLevel ?? 0) <= 2;
      });
    }

    cards = this.sortCards(cards, filters.sortOrder);
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

  getDueTodayCount(collectionId?: string): number {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c => c.srsState && new Date(c.srsState.nextDueAt) <= now).length;
  }

  getDueTodayByMastery(collectionId?: string): Record<MasteryLevel, number> {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const due = cards.filter(c => c.srsState && new Date(c.srsState.nextDueAt) <= now);
    const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MasteryLevel, number>;
    due.forEach(c => {
      const level = (c.srsState?.masteryLevel ?? 0) as MasteryLevel;
      dist[level]++;
    });
    return dist;
  }

  getStrugglingCards(limit = 30): Card[] {
    return this.cardStore.cards()
      .filter(c => {
        const s = c.srsState;
        return s && s.repetitions > 0 && (s.masteryLevel ?? 0) <= 1;
      })
      .sort((a, b) => (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0))
      .slice(0, limit);
  }

  getStrugglingCount(): number {
    return this.cardStore.cards().filter(c => {
      const s = c.srsState;
      return s && s.repetitions > 0 && (s.masteryLevel ?? 0) <= 1;
    }).length;
  }

  getNewCount(collectionId?: string): number {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c => (c.srsState?.masteryLevel ?? 0) === 0).length;
  }
}
