import { calculateStreak, EngagementDayKey, streakFreezeInventory } from '../domain/engagement-domain';
import { PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementDashboard } from '../models/engagement-view.models';

export function buildEngagementDashboard(
  state: PersistedEngagementState,
  todayKey: EngagementDayKey,
  configuredDailyGoal: number,
): EngagementDashboard {
  const progress = state.dailyProgress[todayKey];
  const reviewed = progress?.uniqueCardsReviewed ?? 0;
  const goal = progress?.targetUniqueCards ?? configuredDailyGoal;
  const streakDays = state.streakDays.some(day => day.dayKey === todayKey)
    ? state.streakDays
    : [...state.streakDays, { dayKey: todayKey, goalTarget: goal, uniqueCardsReviewed: reviewed, status: 'open' as const }];
  return {
    today: { reviewed, goal, goalComplete: reviewed >= goal },
    streak: calculateStreak(streakDays, todayKey),
    learningPoints: state.rewardTransactions.reduce((total, transaction) => total + transaction.amount, 0),
    streakFreezes: streakFreezeInventory(state.streakFreezeTransactions),
  };
}
