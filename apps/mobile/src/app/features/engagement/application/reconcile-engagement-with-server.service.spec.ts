import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { EngagementApiService } from '../data-access/engagement-api.service';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementDashboard } from '../models/engagement-view.models';
import { ReconcileEngagementWithServerService } from './reconcile-engagement-with-server.service';
import { calculateStreak, engagementDayKey, StreakDay } from '../domain/engagement-domain';
import { ReconcileStreakFreezesService } from './reconcile-streak-freezes.service';
import { ProjectReviewEngagementService } from './project-review-engagement.service';

function dashboard(reviewed: number, learningPoints: number): EngagementDashboard {
  return {
    today: { reviewed, goal: 20, goalComplete: reviewed >= 20 },
    personalGoal: { reviewed, goal: 30, goalComplete: reviewed >= 30 },
    streak: { current: 1, longest: 1, state: 'safe', lastQualifiedDayKey: null },
    learningPoints,
    streakFreezes: 1,
    streakFreezeProgress: { daysTowardNext: 1, interval: 7, atCapacity: false },
  };
}

async function noPendingCommits(userId: string): ReturnType<ReviewLocalRepository['pendingCommits']> {
  if (!userId) throw new Error('A user is required');
  return [];
}

describe('ReconcileEngagementWithServerService', () => {
  let state: PersistedEngagementState;
  let serverDays: readonly StreakDay[];
  let pendingCommits: jest.MockedFunction<ReviewLocalRepository['pendingCommits']>;
  let service: ReconcileEngagementWithServerService;

  beforeEach(() => {
    state = EMPTY_ENGAGEMENT_STATE;
    serverDays = [];
    pendingCommits = jest.fn(noPendingCommits);
    const mutate: jest.MockedFunction<EngagementLocalRepository['mutate']> = jest.fn(async (_userId, update) => {
      state = update(state);
      return state;
    });
    const readState: jest.MockedFunction<EngagementLocalRepository['state']> = jest.fn(async (userId: string) => {
      if (!userId) throw new Error('A user is required');
      return state;
    });
    TestBed.configureTestingModule({
      providers: [
        ReconcileEngagementWithServerService,
        ProjectReviewEngagementService,
        { provide: EngagementApiService, useValue: { dashboard: () => of({
          dashboard: serverDays.length > 0
            ? { ...dashboard(18, 50), streak: calculateStreak(serverDays, engagementDayKey('2026-08-16')) }
            : dashboard(18, 50),
          recentDays: [],
          streakDays: serverDays,
          streakFreezeTransactions: [{
            transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date('2026-08-10T08:00:00.000Z'),
            amount: 1, reason: 'granted', sourceId: 'freeze-earned:user-1:milestone:1',
          }],
        }) } },
        { provide: ReviewLocalRepository, useValue: { pendingCommits } },
        { provide: EngagementLocalRepository, useValue: { mutate, state: readState } },
      ],
    });
    service = TestBed.inject(ReconcileEngagementWithServerService);
  });

  test('applies the authoritative dashboard when no review events are pending', async () => {
    const result = await service.reconcile('user-1', dashboard(17, 40));
    expect(result).toMatchObject({ appliedServerDashboard: true, dashboard: { today: { reviewed: 18 }, learningPoints: 50 }, recentDays: [] });
    expect(state.lastSuccessfulServerReconciliationAt).not.toBeNull();
    expect(state.streakFreezeTransactions).toEqual([
      expect.objectContaining({ transactionId: 'grant-1', amount: 1 }),
    ]);
  });

  test.each([false, true])('preserves optimistic progress when pending reviews arrive during the request: %s', async arrivesDuringRequest => {
    pendingCommits.mockResolvedValue([{
      event: { type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-1', reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', becameMastered: false, lostMastery: false, becameLeech: false, recoveredFromLeech: false, wasRelearning: false },
      record: { reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', reviewMode: 'recall', promptDirection: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', problemStatusBefore: 'normal', problemStatusAfter: 'normal', wasRelearning: false },
      nextState: { cardId: 'card-1', stage: 'learning', intervalMinutes: 1_440, dueAt: '2026-08-17T10:00:00.000Z', problemStatus: 'normal', totalReviewCount: 1, totalAgainCount: 0, recentRatings: ['good'], successfulReviewsSinceLastAgain: 1 },
    }]);
    if (arrivesDuringRequest) pendingCommits.mockResolvedValueOnce([]);
    const optimistic = dashboard(19, 51);
    const result = await service.reconcile('user-1', optimistic);
    expect(result).toEqual({ dashboard: optimistic, appliedServerDashboard: false, recentDays: null });
    expect(state.streakFreezeTransactions).toEqual([]);
  });

  test.each([3, 30])('keeps a %i-day server streak across repeated offline reloads', async length => {
    serverDays = Array.from({ length }, (_, index) => {
      const date = new Date('2026-08-16T00:00:00Z');
      date.setUTCDate(date.getUTCDate() - length + index);
      return { dayKey: engagementDayKey(date.toISOString().slice(0, 10)),
        goalTarget: 10, uniqueCardsReviewed: 10, status: 'goal_met' };
    });
    state = { ...EMPTY_ENGAGEMENT_STATE, streakDays: serverDays.slice(-1) };
    const server = await service.reconcile('user-1', dashboard(0, 0));
    expect(server.dashboard.streak.current).toBe(length);
    const reconciler = TestBed.inject(ReconcileStreakFreezesService);
    for (let reload = 0; reload < 3; reload += 1) {
      const result = await reconciler.reconcile({ userId: 'user-1', timeZone: 'Europe/Berlin',
        personalDailyGoal: 50, occurredAt: new Date('2026-08-16T10:00:00Z') });
      expect(result.dashboard.streak).toMatchObject({ current: length, longest: length, state: 'at_risk' });
    }
  });

  test('allows the reconciled streak to break after an unprotected missed day', async () => {
    serverDays = [{ dayKey: engagementDayKey('2026-08-14'), goalTarget: 10,
      uniqueCardsReviewed: 10, status: 'goal_met' }];
    await service.reconcile('user-1', dashboard(0, 0));
    state = { ...state, streakFreezeTransactions: [] };
    const result = await TestBed.inject(ReconcileStreakFreezesService).reconcile({
      userId: 'user-1', timeZone: 'Europe/Berlin', personalDailyGoal: 50,
      occurredAt: new Date('2026-08-16T10:00:00Z'),
    });
    expect(result.dashboard.streak).toMatchObject({ current: 0, longest: 1, state: 'broken' });
  });

  test.each([1, 10])('keeps completed server days and rewards when projecting another review with target %i', async target => {
    serverDays = ['2026-08-14', '2026-08-15', '2026-08-16'].map(dayKey => ({
      dayKey: engagementDayKey(dayKey), goalTarget: target, uniqueCardsReviewed: target, status: 'goal_met',
    }));
    await service.reconcile('user-1', dashboard(17, 40));

    const outcome = await TestBed.inject(ProjectReviewEngagementService).project({
      userId: 'user-1',
      timeZone: 'Europe/Berlin',
      personalDailyGoal: 20,
      eligibleCardCount: 10,
      suppressTransientFeedback: false,
      event: {
        type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-2', reviewId: 'review-2', attemptId: 'attempt-2',
        cardId: 'card-2', sessionId: 'session-1', reviewedAt: new Date('2026-08-16T10:00:00.000Z'),
        mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'good',
        stageBefore: 'new', stageAfter: 'learning', becameMastered: false, lostMastery: false,
        becameLeech: false, recoveredFromLeech: false, wasRelearning: false,
      },
    });

    expect(outcome.dashboard.streakFreezes).toBe(1);
    expect(outcome.dashboard.streak).toMatchObject({ current: 3, longest: 3, state: 'safe' });
    expect(outcome.dashboard.today).toEqual({ reviewed: target, goal: target, goalComplete: true });
    expect(outcome.result.feedback).toBeUndefined();
    expect(outcome.result.rewardTransactions.some(transaction => transaction.reason === 'daily_goal_completed')).toBe(false);
  });
});
