import { buildServerStreakDays } from './build-server-streak-days';

describe('buildServerStreakDays', () => {
  test('includes history outside the recent activity window and freezes without reviews', () => {
    const result = buildServerStreakDays([
      { dayKey: '2026-07-01', uniqueCardsReviewed: 4, targetUniqueCards: 4 },
      { dayKey: '2026-08-14', uniqueCardsReviewed: 10, targetUniqueCards: 10 },
      { dayKey: '2026-08-16', uniqueCardsReviewed: 2, targetUniqueCards: 10 },
    ], [
      { reason: 'consumed', protectedDayKey: '2026-08-15' },
      { reason: 'consumed', protectedDayKey: '2026-08-15' },
    ], '2026-08-16');
    expect(result).toEqual([
      { dayKey: '2026-07-01', reviewed: 4, goal: 4, status: 'goal_met' },
      { dayKey: '2026-08-14', reviewed: 10, goal: 10, status: 'goal_met' },
      { dayKey: '2026-08-15', reviewed: 0, goal: 10, status: 'protected_by_freeze' },
      { dayKey: '2026-08-16', reviewed: 2, goal: 10, status: 'open' },
    ]);
  });

  test('preserves goal completion over freeze protection and excludes future days', () => {
    expect(buildServerStreakDays([
      { dayKey: '2026-08-14', uniqueCardsReviewed: 1, targetUniqueCards: 10 },
      { dayKey: '2026-08-15', uniqueCardsReviewed: 10, targetUniqueCards: 10 },
      { dayKey: '2026-08-17', uniqueCardsReviewed: 10, targetUniqueCards: 10 },
    ], [
      { reason: 'consumed', protectedDayKey: '2026-08-15' },
      { reason: 'consumed', protectedDayKey: '2026-08-17' },
    ], '2026-08-16')).toEqual([
      { dayKey: '2026-08-14', reviewed: 1, goal: 10, status: 'missed' },
      { dayKey: '2026-08-15', reviewed: 10, goal: 10, status: 'goal_met' },
    ]);
  });
});
