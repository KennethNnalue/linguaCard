import {computed, inject} from '@angular/core';
import {signalStore, withComputed, withMethods} from '@ngrx/signals';
import {EngagementStore} from '../../engagement/state/engagement.store';
import {SettingsStore} from '../../settings/store/settings.store';
import {CardStore} from '../../vault/store/card.store';
import {MINUTES_PER_CARD_REVIEW} from '../models/review.model';
import {ReviewFilterService} from '../services/review-filter.service';
import {ReviewPrefsService, StudyMode} from '../services/review-prefs.service';

export type ReviewHeroViewModel =
  | {kind: 'empty'}
  | {kind: 'not-started'; cards: number; minutes: number}
  | {kind: 'in-progress'; cards: number; minutes: number; completed: number; goal: number}
  | {kind: 'complete'; reviewed: number; optionalCards: number}
  | {kind: 'caught-up'; newAvailable: number};

function estimateMinutes(cardCount: number): number {
  return Math.max(1, Math.round(cardCount * MINUTES_PER_CARD_REVIEW));
}

export const ReviewHubPresentationStore = signalStore(
  {providedIn: 'root'},
  withComputed(() => {
    const cards = inject(CardStore);
    const engagement = inject(EngagementStore);
    const settings = inject(SettingsStore);
    const filters = inject(ReviewFilterService);
    const prefs = inject(ReviewPrefsService);

    const queue = computed(() => ({
      dueNow: filters.getDueTodayCount(),
      newAvailable: filters.getNewCount(),
      struggling: filters.getStrugglingCount(),
    }));

    return {
      queue,
      mode: prefs.mode,
      mastery: computed(() => ({
        mastered: cards.masteredCount(),
        total: cards.totalCount(),
        progress: cards.totalCount() === 0 ? 0 : cards.masteredCount() / cards.totalCount(),
      })),
      hero: computed<ReviewHeroViewModel>(() => {
        if (cards.cards().length === 0) return {kind: 'empty'};

        const completed = engagement.completedToday();
        const goal = Math.max(1, settings.dailyGoal());
        const available = queue().dueNow + queue().newAvailable;

        if (completed >= goal) {
          const optionalCards = Math.min(goal, available);
          return {kind: 'complete', reviewed: completed, optionalCards};
        }

        if (available === 0) return {kind: 'caught-up', newAvailable: queue().newAvailable};

        const cardsInSession = Math.min(goal - completed, available);
        const minutes = estimateMinutes(cardsInSession);
        return completed === 0
          ? {kind: 'not-started', cards: cardsInSession, minutes}
          : {kind: 'in-progress', cards: cardsInSession, minutes, completed, goal};
      }),
    };
  }),
  withMethods(() => {
    const prefs = inject(ReviewPrefsService);
    return {
      selectMode(mode: StudyMode): void {
        prefs.setMode(mode);
      },
    };
  }),
);
