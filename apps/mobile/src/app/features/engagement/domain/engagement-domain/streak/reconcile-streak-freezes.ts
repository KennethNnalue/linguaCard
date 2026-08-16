import { planStreakFreezeProtectionDays } from '@lingua-card/shared/domain';
import { EngagementCalendar, EngagementDayKey, engagementCalendar, engagementDayKey } from '../shared/engagement-date';
import { StreakDay } from './streak-day';
import { StreakFreezeTransaction } from './streak-freeze';

export interface ReconcileStreakFreezesInput {
  userId: string;
  todayKey: EngagementDayKey;
  occurredAt: Date;
  days: readonly StreakDay[];
  transactions: readonly StreakFreezeTransaction[];
  goalTarget(dayKey: EngagementDayKey): number;
  transactionId(dayKey: EngagementDayKey): string;
  transactionDayKey?(occurredAt: Date): EngagementDayKey;
  calendar?: EngagementCalendar;
}

export interface StreakFreezeReconciliation {
  days: readonly StreakDay[];
  transactions: readonly StreakFreezeTransaction[];
  consumed: readonly StreakFreezeTransaction[];
}

function isQualified(day: StreakDay): boolean {
  return day.status === 'goal_met' || day.status === 'protected_by_freeze';
}

export function reconcileClosedStreakDays(input: ReconcileStreakFreezesInput): StreakFreezeReconciliation {
  const calendar = input.calendar ?? engagementCalendar;
  const ordered = [...input.days].sort((left, right) => left.dayKey.localeCompare(right.dayKey));
  const firstTrackedDay = ordered[0]?.dayKey;
  if (!firstTrackedDay) return { days: [], transactions: [...input.transactions], consumed: [] };

  const yesterdayKey = calendar.previousDay(input.todayKey);
  if (firstTrackedDay > yesterdayKey) return { days: ordered, transactions: [...input.transactions], consumed: [] };

  const daysByKey = new Map(ordered.map(day => [day.dayKey, day]));
  const transactions = [...input.transactions];
  const consumed: StreakFreezeTransaction[] = [];
  const transactionDayKey = input.transactionDayKey
    ?? ((occurredAt: Date) => engagementDayKey(occurredAt.toISOString().slice(0, 10)));
  const plannedProtectionDays = new Set(planStreakFreezeProtectionDays({
    todayKey: input.todayKey,
    firstTrackedDayKey: firstTrackedDay,
    progress: ordered.map(day => ({
      dayKey: day.dayKey,
      reviewed: day.uniqueCardsReviewed,
      goal: day.goalTarget,
    })),
    transactions: transactions.map(transaction => ({
      amount: transaction.amount,
      reason: transaction.reason,
      occurredDayKey: transactionDayKey(transaction.occurredAt),
      protectedDayKey: transaction.protectedDayKey,
    })),
  }));

  for (const dayKey of calendar.daysBetween(firstTrackedDay, yesterdayKey)) {
    const existingDay = daysByKey.get(dayKey);
    if (existingDay && isQualified(existingDay)) continue;

    const goalTarget = existingDay?.goalTarget ?? input.goalTarget(dayKey);
    if (!Number.isInteger(goalTarget) || goalTarget < 1) throw new Error('Closed streak days require a positive goal target');
    const sourceId = `freeze:${input.userId}:${dayKey}`;
    const existingConsumption = transactions.find(transaction =>
      transaction.reason === 'consumed' && transaction.sourceId === sourceId);
    if (existingConsumption) {
      daysByKey.set(dayKey, {
        dayKey,
        goalTarget,
        uniqueCardsReviewed: existingDay?.uniqueCardsReviewed ?? 0,
        status: 'protected_by_freeze',
        freezeTransactionId: existingConsumption.transactionId,
      });
      continue;
    }

    if (plannedProtectionDays.has(dayKey)) {
      const transaction: StreakFreezeTransaction = {
        transactionId: input.transactionId(dayKey), userId: input.userId,
        occurredAt: new Date(input.occurredAt.getTime()), amount: -1, reason: 'consumed',
        protectedDayKey: dayKey, sourceId,
      };
      transactions.push(transaction);
      consumed.push(transaction);
      daysByKey.set(dayKey, {
        dayKey,
        goalTarget,
        uniqueCardsReviewed: existingDay?.uniqueCardsReviewed ?? 0,
        status: 'protected_by_freeze',
        freezeTransactionId: transaction.transactionId,
      });
      continue;
    }

    daysByKey.set(dayKey, {
      dayKey,
      goalTarget,
      uniqueCardsReviewed: existingDay?.uniqueCardsReviewed ?? 0,
      status: 'missed',
    });
  }

  return {
    days: [...daysByKey.values()].sort((left, right) => left.dayKey.localeCompare(right.dayKey)),
    transactions,
    consumed,
  };
}
