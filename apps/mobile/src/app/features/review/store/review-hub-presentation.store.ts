import {computed, inject} from '@angular/core';
import {signalStore, withComputed, withMethods} from '@ngrx/signals';
import {EngagementStore} from '../../engagement/state/engagement.store';
import {SettingsStore} from '../../settings/store/settings.store';
import {VaultV2Store} from '../../vault/store/vault-v2.store';
import {ReviewPrefsService, StudyMode} from '../services/review-prefs.service';
import {estimateReviewMinutes} from '../application/estimate-review-time';

export type ReviewHeroViewModel =
  | {kind: 'empty'}
  | {kind: 'not-started'; cards: number; minutes: number}
  | {kind: 'in-progress'; cards: number; minutes: number; completed: number; goal: number}
  | {kind: 'complete'; reviewed: number; optionalCards: number}
  | {kind: 'caught-up'; newAvailable: number};

export const ReviewHubPresentationStore = signalStore(
  {providedIn: 'root'},
  withComputed(() => {
    const vault = inject(VaultV2Store);
    const engagement = inject(EngagementStore);
    const settings = inject(SettingsStore);
    const prefs = inject(ReviewPrefsService);

    const queue = computed(() => {
      const now = Date.now();
      const items = vault.learningItems();
      return {
        dueNow: items.filter(item => item.reviewState.masterySource !== 'manual'
          && item.reviewState.dueAt !== undefined
          && new Date(item.reviewState.dueAt).getTime() <= now).length,
        newAvailable: items.filter(item => item.reviewState.stage === 'new').length,
        struggling: items.filter(item => item.reviewState.problemStatus === 'leech'
          || (item.reviewState.totalReviewCount > 0 && item.reviewState.stage === 'learning')).length,
      };
    });

    return {
      queue,
      mode: prefs.mode,
      mastery: computed(() => ({
        mastered: vault.learningItems().filter(item => item.reviewState.stage === 'mastered'
          && item.reviewState.relearning === undefined).length,
        total: vault.vault()?.allWords.itemCount ?? 0,
        progress: (vault.vault()?.allWords.masteredPercentage ?? 0) / 100,
      })),
      hero: computed<ReviewHeroViewModel>(() => {
        if (vault.learningItems().length === 0) return {kind: 'empty'};

        const completed = engagement.completedToday();
        const goal = Math.max(1, settings.dailyGoal());
        const available = queue().dueNow + queue().newAvailable;

        if (completed >= goal) {
          const optionalCards = Math.min(goal, available);
          return {kind: 'complete', reviewed: completed, optionalCards};
        }

        if (available === 0) return {kind: 'caught-up', newAvailable: queue().newAvailable};

        const cardsInSession = Math.min(goal - completed, available);
        const reviewCards = Math.min(cardsInSession, queue().dueNow);
        const newCards = Math.max(0, cardsInSession - reviewCards);
        const minutes = estimateReviewMinutes({newCards, reviewCards, mode: prefs.mode()});
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
