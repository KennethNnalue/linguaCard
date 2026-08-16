import { describe, expect, test } from '@jest/globals';
import { planClosedDayFreezeConsumptions } from './streak-freeze-reconciliation';

describe('planClosedDayFreezeConsumptions', () => {
  test('protects missed closed days in chronological order until inventory is exhausted', () => {
    const result = planClosedDayFreezeConsumptions({
      todayKey: '2026-08-16',
      firstTrackedDayKey: '2026-08-12',
      progress: [
        { dayKey: '2026-08-12', reviewed: 3, goal: 3 },
        { dayKey: '2026-08-13', reviewed: 1, goal: 3 },
        { dayKey: '2026-08-15', reviewed: 0, goal: 3 },
      ],
      transactions: [
        { amount: 2, reason: 'granted', occurredDayKey: '2026-08-12' },
      ],
    });

    expect(result.protectedDayKeys).toEqual(['2026-08-13', '2026-08-14']);
  });

  test('does not consume another freeze for an already protected day', () => {
    const result = planClosedDayFreezeConsumptions({
      todayKey: '2026-08-16',
      firstTrackedDayKey: '2026-08-14',
      progress: [],
      transactions: [
        { amount: 2, reason: 'granted', occurredDayKey: '2026-08-13' },
        { amount: -1, reason: 'consumed', occurredDayKey: '2026-08-15', protectedDayKey: '2026-08-14' },
      ],
    });

    expect(result.protectedDayKeys).toEqual(['2026-08-15']);
  });

  test('does not create missed history before engagement tracking begins', () => {
    const result = planClosedDayFreezeConsumptions({
      todayKey: '2026-08-16',
      firstTrackedDayKey: null,
      progress: [],
      transactions: [{ amount: 3, reason: 'granted', occurredDayKey: '2026-08-10' }],
    });

    expect(result.protectedDayKeys).toEqual([]);
  });

  test('does not use a future grant to repair an earlier missed day', () => {
    const result = planClosedDayFreezeConsumptions({
      todayKey: '2026-08-16',
      firstTrackedDayKey: '2026-08-12',
      progress: [
        { dayKey: '2026-08-12', reviewed: 3, goal: 3 },
        { dayKey: '2026-08-15', reviewed: 3, goal: 3 },
      ],
      transactions: [{ amount: 1, reason: 'granted', occurredDayKey: '2026-08-15' }],
    });

    expect(result.protectedDayKeys).toEqual([]);
  });
});
