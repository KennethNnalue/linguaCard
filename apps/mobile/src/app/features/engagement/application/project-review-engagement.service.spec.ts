import { TestBed } from '@angular/core/testing';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { ReviewCommittedEvent } from '../domain/engagement-domain';
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
    let state: PersistedEngagementState = EMPTY_ENGAGEMENT_STATE;
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
      userId: 'user-1', timeZone: 'Europe/Berlin', configuredDailyGoal: 1,
      event: event(), suppressTransientFeedback: true,
    });
    expect(outcome.result.feedback).toBeUndefined();
    expect(outcome.result.rewardTransactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'daily_goal_completed', amount: 10 }),
    ]));
    expect(outcome.dashboard.today.goalComplete).toBe(true);
  });
});
