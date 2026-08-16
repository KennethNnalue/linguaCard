import { planStreakFreezeProtectionDays, StreakFreezeLedgerDay, StreakFreezeLedgerEntry } from '@lingua-card/shared/domain';

export type ClosedDayProgress = StreakFreezeLedgerDay;

export interface FreezeConsumptionPlan {
  protectedDayKeys: readonly string[];
}

export function planClosedDayFreezeConsumptions(input: {
  todayKey: string;
  firstTrackedDayKey: string | null;
  progress: readonly ClosedDayProgress[];
  transactions: readonly StreakFreezeLedgerEntry[];
}): FreezeConsumptionPlan {
  return { protectedDayKeys: planStreakFreezeProtectionDays(input) };
}
