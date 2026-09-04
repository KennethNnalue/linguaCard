import { TestBed } from '@angular/core/testing';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { engagementDayKey, ReviewCommittedEvent } from '../domain/engagement-domain';
import { ProjectReviewEngagementService } from './project-review-engagement.service';

function event(): ReviewCommittedEvent {
  return {
    type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-1', reviewId: 'review-1', attemptId: 'attempt-1',
    cardId: 'card-1', sessionId: 'session-1', reviewedAt: new Date('2026-08-16T10:00:00.000Z'),
    mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'good',
    stageBefore: 'strong', stageAfter: 'strong', becameMastered: false, lostMastery: false,
    becameLeech: false, recoveredFromLeech: false, wasRelearning: false,
  };
}

describe('ProjectReviewEngagementService', () => {
  test('final-card suppression removes only transient feedback, not the earned goal reward', async () => {
    const dayKey = engagementDayKey('2026-08-16');
    let state: PersistedEngagementState = {
      ...EMPTY_ENGAGEMENT_STATE,
      dailyProgress: {
        [dayKey]: {
          userId: 'user-1', dayKey, streakPolicyVersion: 1, targetUniqueCards: 10,
          reviewedCardIds: Array.from({ length: 9 }, (_, index) => `existing-${index}`),
          uniqueCardsReviewed: 9, committedReviewCount: 9,
        },
      },
    };
    const repository = {
      state: jest.fn(async () => state),
      mutate: jest.fn(async (_userId: string, update: (current: PersistedEngagementState) => PersistedEngagementState) => {
        state = update(state);
        return state;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectReviewEngagementService,
        { provide: EngagementLocalRepository, useValue: repository },
      ],
    });
    const service = TestBed.inject(ProjectReviewEngagementService);
    const outcome = await service.project({
      userId: 'user-1', timeZone: 'Europe/Berlin', personalDailyGoal: 1,
      eligibleCardCount: 10, event: event(), suppressTransientFeedback: true,
    });
    expect(outcome.result.feedback).toBeUndefined();
    expect(outcome.result.rewardTransactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'daily_goal_completed', amount: 10 }),
    ]));
    expect(outcome.dashboard.today.goalComplete).toBe(true);
  });

  test('optimistically grants a freeze on the seventh distinct goal day', async () => {
    let state: PersistedEngagementState = {
      ...EMPTY_ENGAGEMENT_STATE,
      dailyProgress: {
        '2026-08-16': {
          userId: 'user-1', dayKey: engagementDayKey('2026-08-16'), streakPolicyVersion: 1,
          targetUniqueCards: 10,
          reviewedCardIds: Array.from({ length: 9 }, (_, index) => `existing-${index}`),
          uniqueCardsReviewed: 9, committedReviewCount: 9,
        },
      },
      streakDays: Array.from({ length: 6 }, (_, index) => ({
        dayKey: engagementDayKey(`2026-08-${String(index + 10).padStart(2, '0')}`),
        goalTarget: 1,
        uniqueCardsReviewed: 1,
        status: 'goal_met' as const,
      })),
    };
    const repository = {
      state: jest.fn(async () => state),
      mutate: jest.fn(async (_userId: string, update: (current: PersistedEngagementState) => PersistedEngagementState) => {
        state = update(state);
        return state;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectReviewEngagementService,
        { provide: EngagementLocalRepository, useValue: repository },
      ],
    });

    const outcome = await TestBed.inject(ProjectReviewEngagementService).project({
      userId: 'user-1', timeZone: 'Europe/Berlin', personalDailyGoal: 1,
      eligibleCardCount: 10, event: event(), suppressTransientFeedback: false,
    });

    expect(outcome.result.freezeEarned).toBe(true);
    expect(outcome.dashboard.streakFreezes).toBe(1);
    expect(outcome.dashboard.today.goal).toBe(10);
    expect(outcome.dashboard.personalGoal).toEqual({ reviewed: 10, goal: 1, goalComplete: true });
    expect(state.streakFreezeTransactions).toEqual([
      expect.objectContaining({ reason: 'granted', amount: 1, sourceId: 'freeze-earned:user-1:milestone:1' }),
    ]);
  });

  test('snapshots a reachable streak target for a library with fewer than ten cards', async () => {
    let state: PersistedEngagementState = { ...EMPTY_ENGAGEMENT_STATE };
    const repository = {
      state: jest.fn(async () => state),
      mutate: jest.fn(async (_userId: string, update: (current: PersistedEngagementState) => PersistedEngagementState) => {
        state = update(state);
        return state;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectReviewEngagementService,
        { provide: EngagementLocalRepository, useValue: repository },
      ],
    });

    const outcome = await TestBed.inject(ProjectReviewEngagementService).project({
      userId: 'user-1', timeZone: 'Europe/Berlin', personalDailyGoal: 50,
      eligibleCardCount: 4, event: event(), suppressTransientFeedback: false,
    });

    expect(outcome.dashboard.today).toMatchObject({ reviewed: 1, goal: 4, goalComplete: false });
    expect(outcome.dashboard.personalGoal).toEqual({ reviewed: 1, goal: 50, goalComplete: false });
  });
});
