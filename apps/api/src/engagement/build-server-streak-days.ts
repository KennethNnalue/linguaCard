import { DAILY_STREAK_POLICY } from '@lingua-card/shared/domain';
import type { ServerEngagementDay } from './engagement-dashboard.service';

interface ProgressDay {
  dayKey: string;
  uniqueCardsReviewed: number;
  targetUniqueCards: number;
}

interface FreezeTransaction {
  reason: string;
  protectedDayKey: string | null;
}

export function buildServerStreakDays(
  progress: readonly ProgressDay[],
  transactions: readonly FreezeTransaction[],
  todayKey: string,
): readonly ServerEngagementDay[] {
  const protectedDays = new Set(transactions.flatMap(transaction =>
    transaction.reason === 'consumed' && transaction.protectedDayKey && transaction.protectedDayKey <= todayKey
      ? [transaction.protectedDayKey] : []));
  const days = new Map<string, ServerEngagementDay>();
  for (const row of progress) {
    if (row.dayKey > todayKey) continue;
    days.set(row.dayKey, {
      dayKey: row.dayKey, reviewed: row.uniqueCardsReviewed, goal: row.targetUniqueCards,
      status: row.uniqueCardsReviewed >= row.targetUniqueCards ? 'goal_met'
        : protectedDays.has(row.dayKey) ? 'protected_by_freeze'
          : row.dayKey === todayKey ? 'open' : 'missed',
    });
  }
  for (const dayKey of protectedDays) {
    if (!days.has(dayKey)) days.set(dayKey, {
      dayKey, reviewed: 0, goal: DAILY_STREAK_POLICY.requiredUniqueReviews, status: 'protected_by_freeze',
    });
  }
  return [...days.values()].sort((left, right) => left.dayKey.localeCompare(right.dayKey));
}
