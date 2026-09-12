import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {DAILY_STREAK_POLICY, type ScheduledCard} from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { SettingsStore } from '../../settings/store/settings.store';
import { estimateReviewMinutes } from '../application/estimate-review-time';
import {
  ReviewSessionPlanningService,
  type ReviewSessionPlanResult,
} from '../application/review-session-planning.service';
import type { ReviewSessionState } from '../domain/review-domain';
import {
  ReviewPrefsService,
  toPromptDirection,
  toReviewMode,
} from '../services/review-prefs.service';
import type {
  ReviewHomeContinuation,
  ReviewHomeDashboard,
  ReviewHomeViewModel,
} from '../models/review-home.model';
import { ReviewStore } from './review.store';

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

function continuationFromPlan(result: ReviewSessionPlanResult): ReviewHomeContinuation {
  if (result.kind === 'ready') return {kind: 'ready', plan: result.plan};
  if (result.kind === 'load_failed') return {kind: 'error'};
  return {kind: 'none'};
}

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
    const settings = inject(SettingsStore);
    const dashboard = computed<ReviewHomeDashboard>(() => ({
      reviewedToday: engagement.completedToday(),
      personalGoal: engagement.personalGoal().goal || settings.dailyGoal(),
      streakTarget: engagement.dailyGoal() || DAILY_STREAK_POLICY.requiredUniqueReviews,
      streak: engagement.streak().current,
      preferences: {mode: prefs.mode(), autoplay: prefs.autoplay()},
    }));

    return {
      dashboard,
      streakReviewsRemaining: computed(() =>
        Math.max(0, dashboard().streakTarget - dashboard().reviewedToday),
      ),
      viewModel: computed<ReviewHomeViewModel>(() => {
        const {reviewedToday, personalGoal} = dashboard();
        const session = review.session();

        if (session?.status === 'active') {
          const remaining = buildRemainingSessionEstimate(session, cards.cards());
          return {
            kind: 'resume',
            sessionId: session.definition.id,
            ...remaining,
          };
        }

        const planState = store.planState();
        if (planState.status === 'idle' || planState.status === 'loading') return { kind: 'loading' };

        const result = planState.result;
        if (result.kind === 'empty_library') return { kind: 'empty' };
        if (reviewedToday >= personalGoal) {
          return {
            kind: 'complete',
            reviewedToday,
            goal: personalGoal,
            continuation: continuationFromPlan(result),
          };
        }
        if (result.kind === 'load_failed') {
          return {kind: 'error'};
        }
        if (result.kind === 'nothing_eligible' || result.kind === 'source_matched_nothing') {
          return {kind: 'nothing-eligible'};
        }
        return {kind: 'ready', plan: result.plan};
      }),
    };
  }),
  withMethods(store => {
    const planning = inject(ReviewSessionPlanningService);
    const review = inject(ReviewStore);
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
        const {reviewedToday, personalGoal, streakTarget} = store.dashboard();
        const remainingPersonalGoal = Math.max(0, personalGoal - reviewedToday);
        const remainingStreakTarget = Math.max(0, streakTarget - reviewedToday);
        const limit = remainingPersonalGoal || remainingStreakTarget || personalGoal;
        const timeZone = settings.settings()?.timezone
          ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
          const result = await planning.plan({
            source: { kind: 'daily' },
            mode: toReviewMode(prefs.mode()),
            direction: toPromptDirection(prefs.dir()),
            limit,
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
