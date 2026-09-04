import { EngagementCalendar, EngagementDayKey, engagementCalendar } from '../domain/engagement-domain';
import { PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementActivity, EngagementDayView, EngagementWeekDay } from '../models/engagement-view.models';

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function mondayFor(dayKey: EngagementDayKey, calendar: EngagementCalendar): EngagementDayKey {
  const weekday = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  let monday = dayKey;
  for (let index = 0; index < daysSinceMonday; index += 1) monday = calendar.previousDay(monday);
  return monday;
}

function countForDay(state: PersistedEngagementState, dayKey: EngagementDayKey): number {
  return state.dailyProgress[dayKey]?.uniqueCardsReviewed ?? 0;
}

export function buildEngagementActivity(
  state: PersistedEngagementState,
  todayKey: EngagementDayKey,
  platformDailyTarget: number,
  calendar: EngagementCalendar = engagementCalendar,
): EngagementActivity {
  const last7DayKeys: EngagementDayKey[] = [todayKey];
  while (last7DayKeys.length < 7) last7DayKeys.unshift(calendar.previousDay(last7DayKeys[0]));
  const last7DaysGoalActivity = last7DayKeys.map(dayKey => {
    const progress = state.dailyProgress[dayKey];
    return progress !== undefined && progress.uniqueCardsReviewed >= progress.targetUniqueCards;
  });

  const recentDayKeys: EngagementDayKey[] = [todayKey];
  while (recentDayKeys.length < 14) recentDayKeys.unshift(calendar.previousDay(recentDayKeys[0]));
  const trackedDayKeys = [
    ...Object.keys(state.dailyProgress),
    ...state.streakDays.map(day => day.dayKey),
  ].sort();
  const firstTrackedDayKey = trackedDayKeys[0];
  const recentDays: EngagementDayView[] = recentDayKeys.map(dayKey => {
    const progress = state.dailyProgress[dayKey];
    const streakDay = state.streakDays.find(day => day.dayKey === dayKey);
    return {
      dayKey,
      reviewed: progress?.uniqueCardsReviewed ?? streakDay?.uniqueCardsReviewed ?? 0,
      goal: progress?.targetUniqueCards ?? streakDay?.goalTarget ?? platformDailyTarget,
      status: streakDay?.status ?? (dayKey === todayKey
        ? 'open'
        : !firstTrackedDayKey || dayKey < firstTrackedDayKey ? 'untracked' : 'missed'),
    };
  });

  const monday = mondayFor(todayKey, calendar);
  let sunday = monday;
  for (let index = 0; index < 6; index += 1) sunday = calendar.nextDay(sunday);
  const weekKeys = calendar.daysBetween(monday, sunday);
  const counts = weekKeys.map(dayKey => countForDay(state, dayKey));
  const maximum = Math.max(...counts, 1);
  const weeklyData: EngagementWeekDay[] = weekKeys.map((dayKey, index) => ({
    dayKey,
    label: WEEKDAY_LABELS[index],
    count: counts[index],
    isToday: dayKey === todayKey,
    isPast: dayKey < todayKey,
    heightPct: Math.max(4, Math.round((counts[index] / maximum) * 50)),
  }));
  return {
    last7DaysGoalActivity,
    recentDays,
    weeklyData,
    weeklyTotal: counts.reduce((total, count) => total + count, 0),
  };
}
