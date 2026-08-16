import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { EngagementApiService } from '../data-access/engagement-api.service';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementDashboard } from '../models/engagement-view.models';
import { ReconcileEngagementWithServerService } from './reconcile-engagement-with-server.service';

function dashboard(reviewed: number, learningPoints: number): EngagementDashboard {
  return {
    today: { reviewed, goal: 20, goalComplete: reviewed >= 20 },
    streak: { current: 1, longest: 1, state: 'safe', lastQualifiedDayKey: null },
    learningPoints,
    streakFreezes: 0,
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
    TestBed.configureTestingModule({
      providers: [
        ReconcileEngagementWithServerService,
        { provide: EngagementApiService, useValue: { dashboard: () => of(dashboard(18, 50)) } },
        { provide: ReviewLocalRepository, useValue: { pendingCommits } },
        { provide: EngagementLocalRepository, useValue: { mutate } },
      ],
    });
    service = TestBed.inject(ReconcileEngagementWithServerService);
  });

  test('applies the authoritative dashboard when no review events are pending', async () => {
    const result = await service.reconcile('user-1', dashboard(17, 40));
    expect(result).toMatchObject({ appliedServerDashboard: true, dashboard: { today: { reviewed: 18 }, learningPoints: 50 } });
    expect(state.lastSuccessfulServerReconciliationAt).not.toBeNull();
  });

  test('preserves optimistic progress while canonical review events remain pending', async () => {
    pendingCommits.mockResolvedValue([{
      event: { type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-1', reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', becameMastered: false, lostMastery: false, becameLeech: false, recoveredFromLeech: false, wasRelearning: false },
      record: { reviewId: 'review-1', attemptId: 'attempt-1', cardId: 'card-1', sessionId: 'session-1', reviewedAt: '2026-08-16T10:00:00.000Z', reviewMode: 'recall', promptDirection: 'source_to_target', responseType: 'self_rated', rating: 'good', stageBefore: 'new', stageAfter: 'learning', problemStatusBefore: 'normal', problemStatusAfter: 'normal', wasRelearning: false },
      nextState: { cardId: 'card-1', stage: 'learning', intervalMinutes: 1_440, dueAt: '2026-08-17T10:00:00.000Z', problemStatus: 'normal', totalReviewCount: 1, totalAgainCount: 0, recentRatings: ['good'], successfulReviewsSinceLastAgain: 1 },
    }]);
    const optimistic = dashboard(19, 51);
    const result = await service.reconcile('user-1', optimistic);
    expect(result).toEqual({ dashboard: optimistic, appliedServerDashboard: false });
  });
});
