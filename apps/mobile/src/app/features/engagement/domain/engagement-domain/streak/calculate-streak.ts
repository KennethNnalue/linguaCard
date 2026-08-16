import { EngagementCalendar, EngagementDayKey, engagementCalendar } from '../shared/engagement-date';
import { Streak } from './streak';
import { StreakDay } from './streak-day';

function qualifies(day: StreakDay): boolean {
  return day.status === 'goal_met' || day.status === 'protected_by_freeze';
}

export function calculateStreak(
  days: readonly StreakDay[],
  todayKey: EngagementDayKey,
  calendar: EngagementCalendar = engagementCalendar,
): Streak {
  const ordered = [...days].sort((left, right) => left.dayKey.localeCompare(right.dayKey));
  const byKey = new Map(ordered.map(day => [day.dayKey, day]));
  const today = byKey.get(todayKey);
  const yesterdayKey = calendar.previousDay(todayKey);
  let cursor = today && qualifies(today) ? todayKey : yesterdayKey;
  let current = 0;
  let cursorDay = byKey.get(cursor);
  while (cursorDay && qualifies(cursorDay)) {
    current += 1;
    cursor = calendar.previousDay(cursor);
    cursorDay = byKey.get(cursor);
  }
  let longest = 0;
  let run = 0;
  let previousQualifiedDayKey: EngagementDayKey | null = null;
  for (const day of ordered) {
    if (!qualifies(day)) {
      run = 0;
      previousQualifiedDayKey = null;
      continue;
    }
    run = previousQualifiedDayKey !== null && calendar.nextDay(previousQualifiedDayKey) === day.dayKey
      ? run + 1
      : 1;
    previousQualifiedDayKey = day.dayKey;
    longest = Math.max(longest, run);
  }
  const todayMet = today?.status === 'goal_met';
  const yesterday = byKey.get(yesterdayKey);
  const yesterdayQualified = yesterday !== undefined && qualifies(yesterday);
  const state = todayMet ? 'safe' : yesterdayQualified ? 'at_risk' : 'broken';
  const lastQualifiedDayKey = [...ordered].reverse().find(qualifies)?.dayKey ?? null;
  return { current, longest: Math.max(longest, current), state, lastQualifiedDayKey };
}
