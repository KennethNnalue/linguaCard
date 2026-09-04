import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AuthService } from '../../../core/services/auth.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { ProjectReviewEngagementService } from '../application/project-review-engagement.service';
import { ReconcileStreakFreezesService } from '../application/reconcile-streak-freezes.service';
import { EngagementPresentationReceiptService } from '../application/engagement-presentation-receipt.service';
import { BuildSessionCelebrationService } from '../application/build-session-celebration.service';
import { ReconcileEngagementWithServerService } from '../application/reconcile-engagement-with-server.service';
import { DailyGoalReachedFeedback, ReviewCommittedEvent, SessionCelebration } from '../domain/engagement-domain';
import { EngagementActivity, EngagementDashboard, EngagementLoadState } from '../models/engagement-view.models';

interface EngagementFeatureState {
  loadState: EngagementLoadState;
  dashboard: EngagementDashboard | null;
  activity: EngagementActivity | null;
  pendingFeedback: DailyGoalReachedFeedback | null;
  reviewAcknowledgement: { id: string; points: number } | null;
  activeCelebration: SessionCelebration | null;
  celebrationShouldAnimate: boolean;
  syncError: { code: string; message: string; recoverable: boolean } | null;
}

const initialState: EngagementFeatureState = {
  loadState: { status: 'idle' }, dashboard: null, activity: null, pendingFeedback: null,
  activeCelebration: null, celebrationShouldAnimate: false, reviewAcknowledgement: null,
  syncError: null,
};

export const EngagementStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(store => ({
    completedToday: computed(() => store.dashboard()?.today.reviewed ?? 0),
    dailyGoal: computed(() => store.dashboard()?.today.goal ?? 0),
    personalGoal: computed(() => store.dashboard()?.personalGoal ?? { reviewed: 0, goal: 0, goalComplete: false }),
    dayStreak: computed(() => store.dashboard()?.streak.current ?? 0),
    learningPoints: computed(() => store.dashboard()?.learningPoints ?? 0),
    streakFreezes: computed(() => store.dashboard()?.streakFreezes ?? 0),
    streakFreezeProgress: computed(() => store.dashboard()?.streakFreezeProgress ?? {
      daysTowardNext: 0, interval: 7, atCapacity: false,
    }),
    streak: computed(() => store.dashboard()?.streak ?? { current: 0, longest: 0, state: 'broken' as const, lastQualifiedDayKey: null }),
    last7DaysActivity: computed(() => store.activity()?.last7DaysGoalActivity ?? []),
    recentDays: computed(() => store.activity()?.recentDays ?? []),
    weeklyData: computed(() => store.activity()?.weeklyData ?? []),
    weeklyTotal: computed(() => store.activity()?.weeklyTotal ?? 0),
  })),
  withMethods(store => {
    const auth = inject(AuthService);
    const settings = inject(SettingsStore);
    const projector = inject(ProjectReviewEngagementService);
    const freezeReconciler = inject(ReconcileStreakFreezesService);
    const presentationReceipts = inject(EngagementPresentationReceiptService);
    const celebrationBuilder = inject(BuildSessionCelebrationService);
    const serverReconciler = inject(ReconcileEngagementWithServerService);
    let acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;

    function context(): { userId: string; timeZone: string; personalDailyGoal: number } | null {
      const userId = auth.currentUser()?.id;
      const userSettings = settings.settings();
      if (!userId || !userSettings?.timezone) return null;
      return { userId, timeZone: userSettings.timezone, personalDailyGoal: settings.dailyGoal() };
    }

    return {
      async loadEngagement(): Promise<void> {
        const request = context();
        if (!request) {
          patchState(store, { loadState: { status: 'error', error: {
            code: 'engagement_context_missing', message: 'Engagement requires a signed-in user and valid timezone.', recoverable: true,
          } } });
          return;
        }
        patchState(store, { loadState: { status: 'loading' } });
        try {
          const { dashboard, activity } = await freezeReconciler.reconcile({ ...request, occurredAt: new Date() });
          patchState(store, { dashboard, activity, loadState: { status: 'ready' } });
        } catch {
          patchState(store, { loadState: { status: 'error', error: {
            code: 'engagement_load_failed', message: 'Engagement progress could not be loaded.', recoverable: true,
          } } });
        }
      },
      async projectCommittedReview(
        event: ReviewCommittedEvent,
        eligibleCardCount: number,
        suppressTransientFeedback = false,
      ): Promise<void> {
        const request = context();
        if (!request) throw new Error('Engagement requires a signed-in user and valid timezone');
        try {
          const outcome = await projector.project({
            ...request, event, eligibleCardCount, suppressTransientFeedback,
          });
          const feedback = outcome.result.feedback;
          const reviewPoints = outcome.result.rewardTransactions
            .filter(transaction => transaction.reason === 'first_daily_card_review')
            .reduce((total, transaction) => total + transaction.amount, 0);
          const showFeedback = feedback !== undefined
            && await presentationReceipts.claim(request.userId, feedback.feedbackId);
          patchState(store, {
            dashboard: outcome.dashboard,
            activity: outcome.activity,
            pendingFeedback: showFeedback ? feedback : store.pendingFeedback(),
            loadState: { status: 'ready' },
            reviewAcknowledgement: reviewPoints > 0
              ? { id: outcome.result.eventId, points: reviewPoints }
              : null,
          });
          if (acknowledgementTimer) clearTimeout(acknowledgementTimer);
          if (reviewPoints > 0) {
            acknowledgementTimer = setTimeout(() => {
              if (store.reviewAcknowledgement()?.id === outcome.result.eventId) {
                patchState(store, { reviewAcknowledgement: null });
              }
            }, 2_000);
          }
        } catch {
          patchState(store, { loadState: { status: 'error', error: {
            code: 'engagement_projection_failed', message: 'Review saved. Engagement progress will be retried.', recoverable: true,
          } } });
          throw new Error('Engagement projection failed');
        }
      },
      async reconcileClosedStreakDays(): Promise<void> {
        const request = context();
        if (!request) throw new Error('Engagement requires a signed-in user and valid timezone');
        try {
          const { dashboard, activity } = await freezeReconciler.reconcile({ ...request, occurredAt: new Date() });
          patchState(store, { dashboard, activity, loadState: { status: 'ready' } });
        } catch {
          patchState(store, { loadState: { status: 'error', error: {
            code: 'streak_reconciliation_failed', message: 'Streak protection could not be reconciled.', recoverable: true,
          } } });
        }
      },
      async reconcileWithServer(): Promise<void> {
        const request = context();
        const dashboard = store.dashboard();
        if (!request || !dashboard) return;
        try {
          const reconciliation = await serverReconciler.reconcile(request.userId, dashboard);
          if (reconciliation.appliedServerDashboard) {
            patchState(store, {
              dashboard: reconciliation.dashboard,
              activity: reconciliation.recentDays && store.activity()
                ? { ...store.activity()!, recentDays: reconciliation.recentDays }
                : store.activity(),
              loadState: { status: 'ready' },
              syncError: null,
            });
          } else {
            patchState(store, { syncError: null });
          }
        } catch {
          patchState(store, { syncError: {
            code: 'engagement_reconciliation_failed', message: 'Server engagement progress could not be reconciled.', recoverable: true,
          } });
        }
      },
      async refreshFromServer(): Promise<void> {
        if (!store.dashboard()) await this.loadEngagement();
        await this.reconcileWithServer();
      },
      dismissFeedback(feedbackId: string): void {
        if (store.pendingFeedback()?.feedbackId === feedbackId) patchState(store, { pendingFeedback: null });
      },
      dismissReviewAcknowledgement(id: string): void {
        if (store.reviewAcknowledgement()?.id === id) patchState(store, { reviewAcknowledgement: null });
      },
      async prepareSessionCelebration(sessionId: string): Promise<void> {
        const request = context();
        if (!request) throw new Error('Engagement requires a signed-in user and valid timezone');
        try {
          const celebration = await celebrationBuilder.build(request.userId, sessionId);
          const receiptId = `session-complete:${request.userId}:${sessionId}`;
          const celebrationShouldAnimate = await presentationReceipts.claim(request.userId, receiptId);
          patchState(store, { activeCelebration: celebration, celebrationShouldAnimate, pendingFeedback: null });
        } catch {
          patchState(store, { loadState: { status: 'error', error: {
            code: 'session_celebration_failed', message: 'Session rewards could not be prepared.', recoverable: true,
          } } });
        }
      },
      setCelebration(celebration: SessionCelebration): void {
        patchState(store, { activeCelebration: celebration, celebrationShouldAnimate: false, pendingFeedback: null });
      },
      dismissCelebration(celebrationId: string): void {
        if (store.activeCelebration()?.celebrationId === celebrationId) {
          patchState(store, { activeCelebration: null, celebrationShouldAnimate: false });
        }
      },
      resetForUserChange(): void {
        if (acknowledgementTimer) clearTimeout(acknowledgementTimer);
        patchState(store, initialState);
      },
    };
  }),
);
