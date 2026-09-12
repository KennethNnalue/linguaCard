import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { SettingsStore } from '../../settings/store/settings.store';
import { estimateReviewMinutes } from '../application/estimate-review-time';
import {
  ReviewSessionPlanningService,
  type ReviewSessionPlan,
  type ReviewSessionPlanResult,
} from '../application/review-session-planning.service';
import type { ReviewSessionState } from '../domain/review-domain';
import type { ReviewAutoplayMode } from '../application/review-audio-policy';
import {
  ReviewPrefsService,
  type StudyMode,
  toPromptDirection,
  toReviewMode,
} from '../services/review-prefs.service';
import { ReviewStore } from './review.store';

export interface ReviewPreferenceSummary {
  mode: StudyMode;
  autoplay: ReviewAutoplayMode;
}

export type ReviewHomeViewModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; recoverable: true }
  | {
      kind: 'resume';
      sessionId: string;
      remainingCards: number;
      estimatedMinutes: number;
      sessionProgress: number;
      completedToday: number;
      goal: number;
      streak: number;
      preferences: ReviewPreferenceSummary;
    }
  | { kind: 'empty' }
  | {
      kind: 'complete';
      reviewedToday: number;
      goal: number;
      streak: number;
      continuationPlan: ReviewSessionPlan | null;
    }
  | {
      kind: 'ready';
      completedToday: number;
      goal: number;
      streak: number;
      plan: ReviewSessionPlan;
      preferences: ReviewPreferenceSummary;
    }
  | { kind: 'nothing-eligible'; canAddWords: boolean };

type ReviewHomePlanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; result: ReviewSessionPlanResult };

interface ReviewHomeState {
  planState: ReviewHomePlanState;
}

const initialState: ReviewHomeState = {
  planState: { status: 'idle' },
};

function buildRemainingSessionEstimate(
  session: ReviewSessionState,
  cards: readonly ScheduledCard[],
): { remainingCards: number; estimatedMinutes: number; sessionProgress: number } {
  const resolvedIds = new Set([
    ...session.completedOriginalCardIds,
    ...session.manuallyMasteredCardIds,
  ]);
  const remainingIds = session.definition.originalCardIds.filter(cardId => !resolvedIds.has(cardId));
  const remainingIdSet = new Set(remainingIds);
  const remaining = cards.filter(card => remainingIdSet.has(card.id));
  const newCards = remaining.filter(card => card.reviewState.stage === 'new').length;
  const reviewCards = remainingIds.length - newCards;
  const totalCards = session.definition.originalCardIds.length;
  return {
    remainingCards: remainingIds.length,
    sessionProgress: totalCards === 0 ? 0 : (totalCards - remainingIds.length) / totalCards,
    estimatedMinutes: estimateReviewMinutes({
      newCards,
      reviewCards,
      mode: session.definition.mode === 'typing' ? 'type' : 'flip',
    }),
  };
}

export const ReviewHomeStore = signalStore(
  withState(initialState),
  withComputed(store => {
    const review = inject(ReviewStore);
    const engagement = inject(EngagementStore);
    const prefs = inject(ReviewPrefsService);
    const cards = inject(CardStore);

    return {
      viewModel: computed<ReviewHomeViewModel>(() => {
        const completedToday = engagement.completedToday();
        const goal = Math.max(1, engagement.dailyGoal());
        const streak = engagement.streak().current;
        const preferences = { mode: prefs.mode(), autoplay: prefs.autoplay() };
        const session = review.session();

        if (session?.status === 'active') {
          const remaining = buildRemainingSessionEstimate(session, cards.cards());
          return {
            kind: 'resume',
            sessionId: session.definition.id,
            ...remaining,
            completedToday,
            goal,
            streak,
            preferences,
          };
        }

        const planState = store.planState();
        if (planState.status === 'idle' || planState.status === 'loading') return { kind: 'loading' };

        const result = planState.result;
        if (result.kind === 'empty_library') return { kind: 'empty' };
        if (completedToday >= goal) {
          return {
            kind: 'complete',
            reviewedToday: completedToday,
            goal,
            streak,
            continuationPlan: result.kind === 'ready' ? result.plan : null,
          };
        }
        if (result.kind === 'load_failed') {
          return { kind: 'error', message: result.error.message, recoverable: true };
        }
        if (result.kind === 'nothing_eligible' || result.kind === 'source_matched_nothing') {
          return { kind: 'nothing-eligible', canAddWords: true };
        }
        return { kind: 'ready', completedToday, goal, streak, plan: result.plan, preferences };
      }),
    };
  }),
  withMethods(store => {
    const planning = inject(ReviewSessionPlanningService);
    const review = inject(ReviewStore);
    const engagement = inject(EngagementStore);
    const settings = inject(SettingsStore);
    const prefs = inject(ReviewPrefsService);
    let refreshSequence = 0;

    return {
      async refresh(): Promise<void> {
        const sequence = ++refreshSequence;
        if (review.session()?.status === 'active') {
          patchState(store, { planState: { status: 'idle' } });
          return;
        }

        patchState(store, { planState: { status: 'loading' } });
        const completedToday = engagement.completedToday();
        const goal = Math.max(1, engagement.dailyGoal());
        const timeZone = settings.settings()?.timezone
          ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
          const result = await planning.plan({
            source: { kind: 'daily' },
            mode: toReviewMode(prefs.mode()),
            direction: toPromptDirection(prefs.dir()),
            limit: completedToday >= goal ? goal : Math.max(1, goal - completedToday),
          }, new Date(), { timeZone });
          if (sequence !== refreshSequence) return;
          patchState(store, { planState: { status: 'resolved', result } });
        } catch {
          if (sequence !== refreshSequence) return;
          patchState(store, {
            planState: {
              status: 'resolved',
              result: {
                kind: 'load_failed',
                error: { code: 'cards_unavailable', message: 'Cards are not ready for review.' },
              },
            },
          });
        }
      },
    };
  }),
);
