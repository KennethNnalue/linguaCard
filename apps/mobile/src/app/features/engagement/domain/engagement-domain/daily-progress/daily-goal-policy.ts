export interface DailyGoalPolicy { targetUniqueCards: number }

export function dailyGoalPolicy(targetUniqueCards: number): DailyGoalPolicy {
  if (!Number.isInteger(targetUniqueCards) || targetUniqueCards < 1) throw new Error('Daily goal must be a positive integer');
  return { targetUniqueCards };
}
