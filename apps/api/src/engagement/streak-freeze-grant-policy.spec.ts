import { describe, expect, test } from '@jest/globals';
import { dailyStreakReviewTarget, streakFreezeGrantMilestone } from '@lingua-card/shared/domain';

describe('dailyStreakReviewTarget', () => {
  test.each([[1, 1], [4, 4], [10, 10], [30, 10]])(
    'uses a reachable target for %i eligible cards',
    (eligibleCards, target) => expect(dailyStreakReviewTarget(eligibleCards)).toBe(target),
  );
});

describe('streakFreezeGrantMilestone', () => {
  test.each([
    [7, 0, 1],
    [14, 1, 2],
    [21, 0, 3],
  ])('grants milestone %i when inventory is %i', (qualifyingDays, inventory, milestone) => {
    expect(streakFreezeGrantMilestone(qualifyingDays, inventory)).toBe(milestone);
  });

  test('does not grant between seven-day milestones', () => {
    expect(streakFreezeGrantMilestone(8, 0)).toBeNull();
  });

  test('does not grant above the inventory cap', () => {
    expect(streakFreezeGrantMilestone(14, 2)).toBeNull();
  });
});
