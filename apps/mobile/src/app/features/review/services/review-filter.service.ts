import { inject, Injectable } from '@angular/core';
import { LearningStage, ScheduledCard } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { isDue, isNew, isStruggling } from '../domain/review-status';
import {
  ReviewFilters,
  ReviewLimit,
  ReviewPreset,
  ReviewPresetId,
  ReviewSortOrder,
  ReviewSource,
  SESSION_COLOUR_BAD,
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
        stages: ['new', 'learning', 'familiar', 'strong', 'mastered'],
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
        stages: ['learning'],
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
        stages: ['new'],
        sortOrder: ReviewSortOrder.RANDOM,
        limit: ReviewLimit.NEW_ONLY,
      },
    },
  ];

  getMasteryDistribution(collectionId?: string): Record<LearningStage, number> {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const dist: Record<LearningStage, number> = { new: 0, learning: 0, familiar: 0, strong: 0, mastered: 0 };
    for (const card of cards) dist[card.reviewState.stage]++;
    return dist;
  }

  // Cards that have been studied at least once and whose next review date has passed.
  // New (never studied) cards are counted separately via getNewCount().
  getDueTodayCount(collectionId?: string): number {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(c => isDue(c, now)).length;
  }

  getDueTodayByMastery(collectionId?: string): Record<LearningStage, number> {
    const now = new Date();
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    const due = cards.filter(c => isDue(c, now));
    const dist: Record<LearningStage, number> = { new: 0, learning: 0, familiar: 0, strong: 0, mastered: 0 };
    for (const card of due) dist[card.reviewState.stage]++;
    return dist;
  }

  getStrugglingCards(limit?: number): ScheduledCard[] {
    const cards = this.cardStore.cards()
      .filter(isStruggling)
      .sort((a, b) => b.reviewState.totalAgainCount - a.reviewState.totalAgainCount);
    return limit === undefined ? cards : cards.slice(0, limit);
  }

  getStrugglingCount(): number {
    return this.cardStore.cards().filter(isStruggling).length;
  }

  getNewCount(collectionId?: string): number {
    let cards = this.cardStore.cards();
    if (collectionId) cards = cards.filter(c => c.collectionId === collectionId);
    return cards.filter(isNew).length;
  }
}
