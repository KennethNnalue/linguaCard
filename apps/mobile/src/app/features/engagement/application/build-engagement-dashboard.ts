import { calculateStreak, EngagementDayKey, streakFreezeInventory } from '../domain/engagement-domain';
import { PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementDashboard } from '../models/engagement-view.models';
import { MAX_STREAK_FREEZE_INVENTORY, STREAK_FREEZE_GOAL_INTERVAL } from '@lingua-card/shared/domain';

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
  const streakFreezes = streakFreezeInventory(state.streakFreezeTransactions);
  const qualifyingGoalDayCount = streakDays.filter(day => day.status === 'goal_met').length;
  return {
    today: { reviewed, goal, goalComplete: reviewed >= goal },
    streak: calculateStreak(streakDays, todayKey),
    learningPoints: state.rewardTransactions.reduce((total, transaction) => total + transaction.amount, 0),
    streakFreezes,
    streakFreezeProgress: {
      daysTowardNext: streakFreezes >= MAX_STREAK_FREEZE_INVENTORY
        ? 0
        : qualifyingGoalDayCount % STREAK_FREEZE_GOAL_INTERVAL,
      interval: STREAK_FREEZE_GOAL_INTERVAL,
      atCapacity: streakFreezes >= MAX_STREAK_FREEZE_INVENTORY,
    },
  };
}
