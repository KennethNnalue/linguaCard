import { EMPTY_ENGAGEMENT_STATE } from '../data-access/engagement-local.models';
import { DailyProgress, engagementDayKey } from '../domain/engagement-domain';
import { buildEngagementActivity } from './build-engagement-activity';

function progress(dayKey: string, reviewed: number, target = 2): DailyProgress {
  return {
    userId: 'user-1', dayKey: engagementDayKey(dayKey), targetUniqueCards: target,
    reviewedCardIds: Array.from({ length: reviewed }, (_, index) => `card-${dayKey}-${index}`),
    uniqueCardsReviewed: reviewed, committedReviewCount: reviewed,
  };
}

describe('buildEngagementActivity', () => {
  test('builds a Monday-first week from persisted daily projections', () => {
    const state = {
      ...EMPTY_ENGAGEMENT_STATE,
      dailyProgress: {
        '2026-08-10': progress('2026-08-10', 2),
        '2026-08-12': progress('2026-08-12', 1),
        '2026-08-16': progress('2026-08-16', 3),
      },
    };
    const activity = buildEngagementActivity(state, engagementDayKey('2026-08-16'));
    expect(activity.weeklyData.map(day => [day.label, day.dayKey, day.count])).toEqual([
      ['Mo', '2026-08-10', 2], ['Tu', '2026-08-11', 0], ['We', '2026-08-12', 1],
      ['Th', '2026-08-13', 0], ['Fr', '2026-08-14', 0], ['Sa', '2026-08-15', 0], ['Su', '2026-08-16', 3],
    ]);
    expect(activity.weeklyTotal).toBe(6);
  });

  test('marks goal activity using each persisted day target snapshot', () => {
    const state = {
      ...EMPTY_ENGAGEMENT_STATE,
      dailyProgress: {
        '2026-08-15': progress('2026-08-15', 2, 2),
        '2026-08-16': progress('2026-08-16', 2, 3),
      },
    };
    const activity = buildEngagementActivity(state, engagementDayKey('2026-08-16'));
    expect(activity.last7DaysGoalActivity.slice(-2)).toEqual([true, false]);
  });
});
