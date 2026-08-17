import { TestBed } from '@angular/core/testing';
import { LocalDataService } from '../../../core/services/local-data.service';
import { commitReview, createNewSchedulingState } from '../domain/review-domain';
import { PersistedReviewLocalState, toPendingReviewCommit } from '../domain/review-persistence';
import { ReviewLocalRepository } from './review-local.repository';
import { CardAdministrationType, createNewReviewSchedulingState } from '@lingua-card/shared/domain';

function pendingCommit(eventId = 'event-1', attemptId = 'attempt-1') {
  const committed = commitReview(createNewSchedulingState('card-1'), {
    reviewId: `review-${eventId}`,
    eventId,
    attemptId,
    sessionId: 'session-1',
    reviewedAt: new Date('2026-08-14T10:00:00.000Z'),
    reviewMode: 'recall',
    promptDirection: 'source_to_target',
    responseType: 'self_rated',
    rating: 'good',
  });
  return toPendingReviewCommit(committed.event, committed.record, committed.schedule.nextState);
}

describe('ReviewLocalRepository', () => {
  let state: PersistedReviewLocalState;
  let setState: jest.MockedFunction<LocalDataService['setReviewLocalState']>;
  let repository: ReviewLocalRepository;

  beforeEach(() => {
    state = { schedulingStates: {}, outbox: [], records: [], events: [], administrationOutbox: [] };
    const getState: jest.MockedFunction<LocalDataService['getReviewLocalState']> = jest.fn(async (userId: string) => {
      void userId;
      return state;
    });
    setState = jest.fn(async (_userId, next) => { state = next; });
    TestBed.configureTestingModule({
      providers: [
        ReviewLocalRepository,
        { provide: LocalDataService, useValue: { getReviewLocalState: getState, setReviewLocalState: setState } },
      ],
    });
    repository = TestBed.inject(ReviewLocalRepository);
  });

  test('persists scheduling state, outbox, record, and event in one local write', async () => {
    const pending = pendingCommit();

    await repository.commit('user-1', pending);

    expect(setState).toHaveBeenCalledWith('user-1', {
      schedulingStates: { 'card-1': pending.nextState },
      outbox: [pending], records: [pending.record], events: [pending.event], administrationOutbox: [],
    });
  });

  test('does not write a duplicate event or attempt', async () => {
    const pending = pendingCommit();
    await repository.commit('user-1', pending);
    setState.mockClear();

    await repository.commit('user-1', pendingCommit('event-2', pending.record.attemptId));

    expect(setState).not.toHaveBeenCalled();
  });

  test('retains the outbox entry when removal persistence fails', async () => {
    const pending = pendingCommit();
    await repository.commit('user-1', pending);
    setState.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(repository.removeOutboxEvents('user-1', new Set([pending.event.eventId]))).rejects.toThrow('storage unavailable');

    expect(state.outbox).toEqual([pending]);
  });

  test('persists an administration command with its optimistic scheduling state', async () => {
    const administration = {
      cardId: 'card-1',
      command: { commandId: 'admin-1', type: CardAdministrationType.MANUALLY_MASTER },
    };
    const nextState = { ...createNewReviewSchedulingState('card-1'), stage: 'mastered' as const, masterySource: 'manual' as const };

    await repository.administer('user-1', administration, nextState);

    expect(state.schedulingStates['card-1']).toEqual(nextState);
    expect(await repository.pendingAdministrations('user-1')).toEqual([administration]);
  });

  test('removes only administrations accepted by the server', async () => {
    const first = { cardId: 'card-1', command: { commandId: 'admin-1', type: CardAdministrationType.MANUALLY_MASTER } };
    const second = { cardId: 'card-1', command: { commandId: 'admin-2', type: CardAdministrationType.UNDO_MANUAL_MASTERY } };
    const scheduling = createNewReviewSchedulingState('card-1');
    await repository.administer('user-1', first, scheduling);
    await repository.administer('user-1', second, scheduling);

    await repository.removeAdministrationCommands('user-1', new Set(['admin-1']));

    expect(await repository.pendingAdministrations('user-1')).toEqual([second]);
  });
});
