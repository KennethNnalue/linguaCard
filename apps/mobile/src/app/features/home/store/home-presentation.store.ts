import {computed, inject} from '@angular/core';
import {signalStore, withComputed} from '@ngrx/signals';
import {EngagementStore} from '../../engagement/state/engagement.store';
import {estimateReviewMinutes} from '../../review/application/estimate-review-time';
import {ReviewFilterService} from '../../review/services/review-filter.service';
import {ReviewPrefsService} from '../../review/services/review-prefs.service';
import {ReviewStore} from '../../review/store/review.store';
import {CardStore} from '../../vault/store/card.store';

export type HomePrimaryAction = 'add-vocabulary' | 'start-review' | 'learn-new' | 'keep-practicing';

export type HomeHeroViewModel =
  | {kind: 'empty'; action: 'add-vocabulary'}
  | {kind: 'first-review'; cards: number; minutes: number; action: 'start-review'}
  | {kind: 'not-started'; goal: number; cards: number; minutes: number; streak: number; action: 'start-review'}
  | {kind: 'in-progress'; completed: number; goal: number; remaining: number; progress: number; minutes: number; streak: number; action: 'start-review'}
  | {kind: 'complete'; reviewed: number; streak: number; action: 'keep-practicing'}
  | {kind: 'caught-up'; newAvailable: number; action: 'add-vocabulary' | 'learn-new'};

export const HomePresentationStore = signalStore(
  {providedIn: 'root'},
  withComputed(() => {
    const cards = inject(CardStore);
    const engagement = inject(EngagementStore);
    const reviewFilter = inject(ReviewFilterService);
    const reviewPrefs = inject(ReviewPrefsService);
    const review = inject(ReviewStore);

    return {
      hero: computed<HomeHeroViewModel>(() => {
        const totalCards = cards.cards().length;
        if (totalCards === 0) return {kind: 'empty', action: 'add-vocabulary'};

        const completed = engagement.completedToday();
        const goal = Math.max(1, engagement.dailyGoal());
        const streak = engagement.streak().current;
        const due = reviewFilter.getDueTodayCount();
        const newAvailable = reviewFilter.getNewCount();
        const available = due + newAvailable;

        if (completed >= goal) {
          return {kind: 'complete', reviewed: completed, streak, action: 'keep-practicing'};
        }

        if (available === 0) {
          return {
            kind: 'caught-up',
            newAvailable,
            action: newAvailable > 0 ? 'learn-new' : 'add-vocabulary',
          };
        }

        const remaining = goal - completed;
        const cardsInSession = Math.min(remaining, available);
        const reviewCards = Math.min(cardsInSession, due);
        const newCards = Math.max(0, cardsInSession - reviewCards);
        const minutes = estimateReviewMinutes({newCards, reviewCards, mode: reviewPrefs.mode()});

        if (review.sessionHistory().length === 0 && completed === 0) {
          return {kind: 'first-review', cards: cardsInSession, minutes, action: 'start-review'};
        }

        if (completed === 0) {
          return {kind: 'not-started', goal, cards: cardsInSession, minutes, streak, action: 'start-review'};
        }

        return {
          kind: 'in-progress',
          completed,
          goal,
          remaining,
          progress: Math.min(1, completed / goal),
          minutes,
          streak,
          action: 'start-review',
        };
      }),
    };
  }),
);
