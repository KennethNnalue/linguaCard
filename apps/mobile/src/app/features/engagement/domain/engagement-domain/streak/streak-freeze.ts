import { EngagementDayKey } from '../shared/engagement-date';

export type StreakFreezeTransactionReason = 'granted' | 'consumed' | 'revoked' | 'expired';
export interface StreakFreezeTransaction {
  transactionId: string;
  userId: string;
  occurredAt: Date;
  amount: number;
  reason: StreakFreezeTransactionReason;
  protectedDayKey?: EngagementDayKey;
  sourceId: string;
}
export interface StreakFreezeGrantPolicy {
  grantsForDay(userId: string, dayKey: EngagementDayKey): readonly StreakFreezeTransaction[];
}
export function streakFreezeInventory(transactions: readonly StreakFreezeTransaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}
