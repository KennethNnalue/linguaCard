import { TestBed } from '@angular/core/testing';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { engagementDayKey } from '../domain/engagement-domain';
import { ReconcileStreakFreezesService } from './reconcile-streak-freezes.service';

describe('ReconcileStreakFreezesService', () => {
  let state: PersistedEngagementState;
  let mutate: jest.MockedFunction<EngagementLocalRepository['mutate']>;
  let service: ReconcileStreakFreezesService;

  beforeEach(() => {
    state = {
      ...EMPTY_ENGAGEMENT_STATE,
      streakDays: [{ dayKey: engagementDayKey('2026-08-14'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' }],
      streakFreezeTransactions: [{
        transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date('2026-08-14T08:00:00.000Z'),
        amount: 1, reason: 'granted', sourceId: 'grant-1',
      }],
    };
    mutate = jest.fn(async (_userId, update) => {
      state = update(state);
      return state;
    });
    TestBed.configureTestingModule({
      providers: [
        ReconcileStreakFreezesService,
        { provide: EngagementLocalRepository, useValue: { mutate } },
      ],
    });
    service = TestBed.inject(ReconcileStreakFreezesService);
  });

  test('persists the protected day and immutable consumption in one repository mutation', async () => {
    const outcome = await service.reconcile({
      userId: 'user-1', timeZone: 'Europe/Berlin', configuredDailyGoal: 2,
      occurredAt: new Date('2026-08-16T08:00:00.000Z'),
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(state.streakDays.find(day => day.dayKey === '2026-08-15')?.status).toBe('protected_by_freeze');
    expect(state.streakFreezeTransactions).toHaveLength(2);
    expect(outcome).toMatchObject({ consumedFreezeCount: 1, dashboard: { streakFreezes: 0 } });
  });

  test('a second reconciliation creates no duplicate consumption', async () => {
    const request = {
      userId: 'user-1', timeZone: 'Europe/Berlin', configuredDailyGoal: 2,
      occurredAt: new Date('2026-08-16T08:00:00.000Z'),
    };
    await service.reconcile(request);
    const outcome = await service.reconcile(request);
    expect(state.streakFreezeTransactions).toHaveLength(2);
    expect(outcome.consumedFreezeCount).toBe(0);
  });
});
