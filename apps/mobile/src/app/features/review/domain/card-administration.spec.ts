import {
  applyCardAdministration,
  CardAdministrationType,
  createNewReviewSchedulingState,
  ReviewSchedulingState,
} from '@lingua-card/shared/domain';

const occurredAt = new Date('2026-08-14T10:00:00.000Z');

function leechState(): ReviewSchedulingState {
  return {
    ...createNewReviewSchedulingState('card-1'),
    stage: 'familiar', intervalMinutes: 10_080, dueAt: '2026-08-14T10:00:00.000Z',
    problemStatus: 'leech', totalReviewCount: 12, totalAgainCount: 8,
    recentRatings: ['again', 'hard'],
  };
}

describe('card administration', () => {
  test('manual mastery preserves review counters and can be applied repeatedly', () => {
    const first = applyCardAdministration(leechState(), {
      commandId: 'command-1', type: CardAdministrationType.MANUALLY_MASTER,
    }, occurredAt, 'event-1');
    const repeated = applyCardAdministration(first.nextState, {
      commandId: 'command-2', type: CardAdministrationType.MANUALLY_MASTER,
    }, occurredAt, 'event-2');

    expect(first.nextState).toMatchObject({
      stage: 'mastered', masterySource: 'manual', totalReviewCount: 12, totalAgainCount: 8,
    });
    expect(repeated.nextState).toBe(first.nextState);
  });

  test('undo restores the captured scheduling state with the seven-day cap', () => {
    const mastered = applyCardAdministration({ ...leechState(), intervalMinutes: 43_200 }, {
      commandId: 'command-1', type: CardAdministrationType.MANUALLY_MASTER,
    }, occurredAt, 'event-1').nextState;
    const undone = applyCardAdministration(mastered, {
      commandId: 'command-2', type: CardAdministrationType.UNDO_MANUAL_MASTERY,
    }, occurredAt, 'event-2');

    expect(undone.nextState).toMatchObject({
      stage: 'familiar', intervalMinutes: 10_080, masterySource: undefined,
      dueAt: '2026-08-21T10:00:00.000Z',
    });
  });

  test('leech rest schedules seven days without changing review counters', () => {
    const rested = applyCardAdministration(leechState(), {
      commandId: 'command-1', type: CardAdministrationType.SCHEDULE_LEECH_REST,
    }, occurredAt, 'event-1');

    expect(rested.nextState).toMatchObject({
      dueAt: '2026-08-21T10:00:00.000Z', totalReviewCount: 12, totalAgainCount: 8,
    });
    expect(rested.event.type).toBe('LeechRestScheduled');
  });

  test('reset requires confirmation and retains immutable review history', () => {
    const command = { commandId: 'command-1', type: CardAdministrationType.RESET_PROGRESS };
    expect(() => applyCardAdministration(leechState(), command, occurredAt, 'event-1')).toThrow(
      'Progress reset requires confirmation that review history will be retained',
    );
    const reset = applyCardAdministration(leechState(), {
      ...command, confirmHistoryRetention: true,
    }, occurredAt, 'event-1');

    expect(reset.nextState).toEqual(createNewReviewSchedulingState('card-1'));
    expect(reset.event).toMatchObject({ type: 'CardProgressReset', historyRetained: true });
    expect('rating' in reset.event).toBe(false);
  });
});
