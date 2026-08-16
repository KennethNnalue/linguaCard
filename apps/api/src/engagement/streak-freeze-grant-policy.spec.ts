import { describe, expect, test } from '@jest/globals';
import { streakFreezeGrantMilestone } from '@lingua-card/shared/domain';

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
