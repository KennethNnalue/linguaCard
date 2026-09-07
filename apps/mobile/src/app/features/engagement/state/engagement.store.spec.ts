import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { BuildSessionCelebrationService } from '../application/build-session-celebration.service';
import { EngagementPresentationReceiptService } from '../application/engagement-presentation-receipt.service';
import { ProjectReviewEngagementService } from '../application/project-review-engagement.service';
import { ReconcileEngagementWithServerService } from '../application/reconcile-engagement-with-server.service';
import { ReconcileStreakFreezesOutcome, ReconcileStreakFreezesService } from '../application/reconcile-streak-freezes.service';
import { EngagementStore } from './engagement.store';

function outcome(current: number): ReconcileStreakFreezesOutcome {
  return {
    dashboard: {
      today: { reviewed: 0, goal: 10, goalComplete: false },
      personalGoal: { reviewed: 0, goal: 50, goalComplete: false },
      streak: { current, longest: current, state: 'at_risk', lastQualifiedDayKey: null },
      learningPoints: 0, streakFreezes: 0,
      streakFreezeProgress: { daysTowardNext: 0, interval: 7, atCapacity: false },
    },
    activity: { recentDays: [], last7DaysGoalActivity: [], weeklyData: [], weeklyTotal: 0 },
    consumedFreezeCount: 0,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Promise not initialized'); };
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('EngagementStore reconciliation ordering', () => {
  let local: jest.MockedFunction<ReconcileStreakFreezesService['reconcile']>;
  let server: jest.MockedFunction<ReconcileEngagementWithServerService['reconcile']>;
  let store: InstanceType<typeof EngagementStore>;

  beforeEach(() => {
    local = jest.fn<ReturnType<ReconcileStreakFreezesService['reconcile']>, Parameters<ReconcileStreakFreezesService['reconcile']>>(async () => outcome(1));
    server = jest.fn<ReturnType<ReconcileEngagementWithServerService['reconcile']>, Parameters<ReconcileEngagementWithServerService['reconcile']>>(async () => ({ dashboard: outcome(3).dashboard, appliedServerDashboard: true, recentDays: [] }));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
      { provide: SettingsStore, useValue: { settings: () => ({ timezone: 'Europe/Berlin' }), dailyGoal: () => 50 } },
      { provide: ReconcileStreakFreezesService, useValue: { reconcile: local } },
      { provide: ReconcileEngagementWithServerService, useValue: { reconcile: server } },
      { provide: ProjectReviewEngagementService, useValue: {} },
      { provide: EngagementPresentationReceiptService, useValue: {} },
      { provide: BuildSessionCelebrationService, useValue: {} },
    ] });
    store = TestBed.inject(EngagementStore);
  });

  test('finishes server persistence before a navigation-triggered local reload', async () => {
    await store.loadEngagement();
    const response = deferred<Awaited<ReturnType<ReconcileEngagementWithServerService['reconcile']>>>();
    const started = deferred<void>();
    server.mockImplementationOnce(() => { started.resolve(); return response.promise; });
    const sync = store.reconcileWithServer();
    await started.promise;
    const reload = store.loadEngagement();
    expect(local).toHaveBeenCalledTimes(1);
    local.mockResolvedValue(outcome(3));
    response.resolve({ dashboard: outcome(3).dashboard, appliedServerDashboard: true, recentDays: [] });
    await Promise.all([sync, reload]);
    expect(store.dayStreak()).toBe(3);
    expect(local).toHaveBeenCalledTimes(2);
  });

  test('does not restore old user state when an in-flight load finishes after reset', async () => {
    const response = deferred<ReconcileStreakFreezesOutcome>();
    const started = deferred<void>();
    local.mockImplementationOnce(() => { started.resolve(); return response.promise; });
    const load = store.loadEngagement();
    await started.promise;
    store.resetForUserChange();
    response.resolve(outcome(3));
    await load;
    expect(store.dashboard()).toBeNull();
    expect(store.loadState()).toEqual({ status: 'idle' });
  });

  test('continues loading after a failed operation', async () => {
    local.mockRejectedValueOnce(new Error('Storage unavailable'));
    await store.loadEngagement();
    expect(store.loadState().status).toBe('error');
    await store.loadEngagement();
    expect(store.dayStreak()).toBe(1);
    expect(store.loadState().status).toBe('ready');
  });
});
