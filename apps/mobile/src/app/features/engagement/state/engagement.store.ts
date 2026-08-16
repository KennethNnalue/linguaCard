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
  activeCelebration: SessionCelebration | null;
  celebrationShouldAnimate: boolean;
  syncError: { code: string; message: string; recoverable: boolean } | null;
}

const initialState: EngagementFeatureState = {
  loadState: { status: 'idle' }, dashboard: null, activity: null, pendingFeedback: null,
  activeCelebration: null, celebrationShouldAnimate: false,
  syncError: null,
};

export const EngagementStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(store => ({
    completedToday: computed(() => store.dashboard()?.today.reviewed ?? 0),
    dailyGoal: computed(() => store.dashboard()?.today.goal ?? 0),
    dayStreak: computed(() => store.dashboard()?.streak.current ?? 0),
    learningPoints: computed(() => store.dashboard()?.learningPoints ?? 0),
    streak: computed(() => store.dashboard()?.streak ?? { current: 0, longest: 0, state: 'broken' as const, lastQualifiedDayKey: null }),
    last7DaysActivity: computed(() => store.activity()?.last7DaysGoalActivity ?? []),
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

    function context(): { userId: string; timeZone: string; configuredDailyGoal: number } | null {
      const userId = auth.currentUser()?.id;
      const userSettings = settings.settings();
      if (!userId || !userSettings?.timezone) return null;
      return { userId, timeZone: userSettings.timezone, configuredDailyGoal: settings.dailyGoal() };
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
      async projectCommittedReview(event: ReviewCommittedEvent, suppressTransientFeedback = false): Promise<void> {
        const request = context();
        if (!request) throw new Error('Engagement requires a signed-in user and valid timezone');
        try {
          const outcome = await projector.project({ ...request, event, suppressTransientFeedback });
          const feedback = outcome.result.feedback;
          const showFeedback = feedback !== undefined
            && await presentationReceipts.claim(request.userId, feedback.feedbackId);
          patchState(store, {
            dashboard: outcome.dashboard,
            activity: outcome.activity,
            pendingFeedback: showFeedback ? feedback : store.pendingFeedback(),
            loadState: { status: 'ready' },
          });
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
            patchState(store, { dashboard: reconciliation.dashboard, loadState: { status: 'ready' }, syncError: null });
          } else {
            patchState(store, { syncError: null });
          }
        } catch {
          patchState(store, { syncError: {
            code: 'engagement_reconciliation_failed', message: 'Server engagement progress could not be reconciled.', recoverable: true,
          } });
        }
      },
      dismissFeedback(feedbackId: string): void {
        if (store.pendingFeedback()?.feedbackId === feedbackId) patchState(store, { pendingFeedback: null });
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
        patchState(store, initialState);
      },
    };
  }),
);
