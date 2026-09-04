import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { EngagementApiService } from '../data-access/engagement-api.service';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementDashboard } from '../models/engagement-view.models';
import { ReconcileEngagementWithServerService } from './reconcile-engagement-with-server.service';
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
  let pendingCommits: jest.MockedFunction<ReviewLocalRepository['pendingCommits']>;
  let service: ReconcileEngagementWithServerService;

  beforeEach(() => {
    state = EMPTY_ENGAGEMENT_STATE;
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
          dashboard: dashboard(18, 50),
          recentDays: [],
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

  test('preserves optimistic progress while canonical review events remain pending', async () => {
    pendingCommits.mockResolvedValue([{
      event: { type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-1', reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', becameMastered: false, lostMastery: false, becameLeech: false, recoveredFromLeech: false, wasRelearning: false },
      record: { reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', reviewMode: 'recall', promptDirection: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', problemStatusBefore: 'normal', problemStatusAfter: 'normal', wasRelearning: false },
      nextState: { cardId: 'card-1', stage: 'learning', intervalMinutes: 1_440, dueAt: '2026-08-17T10:00:00.000Z', problemStatus: 'normal', totalReviewCount: 1, totalAgainCount: 0, recentRatings: ['good'], successfulReviewsSinceLastAgain: 1 },
    }]);
    const optimistic = dashboard(19, 51);
    const result = await service.reconcile('user-1', optimistic);
    expect(result).toEqual({ dashboard: optimistic, appliedServerDashboard: false, recentDays: null });
    expect(state.streakFreezeTransactions).toEqual([]);
  });

  test('keeps canonical freeze inventory when the next review is projected locally', async () => {
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
  });
});
