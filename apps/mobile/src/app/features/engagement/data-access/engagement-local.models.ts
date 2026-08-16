import {
  DailyProgress, EngagementDayKey, EngagementProjectionResult, RewardTransaction, StreakDay,
  StreakFreezeTransaction,
} from '../domain/engagement-domain';

export interface PersistedEngagementState {
  processedEventDayKeys: Readonly<Record<string, EngagementDayKey>>;
  projectionResults: Readonly<Record<string, EngagementProjectionResult>>;
  dailyProgress: Readonly<Record<string, DailyProgress>>;
  streakDays: readonly StreakDay[];
  rewardTransactions: readonly RewardTransaction[];
  streakFreezeTransactions: readonly StreakFreezeTransaction[];
  presentationReceipts: readonly string[];
  lastSuccessfulServerReconciliationAt: string | null;
}

export const EMPTY_ENGAGEMENT_STATE: PersistedEngagementState = {
  processedEventDayKeys: {}, projectionResults: {}, dailyProgress: {}, streakDays: [], rewardTransactions: [],
  streakFreezeTransactions: [], presentationReceipts: [], lastSuccessfulServerReconciliationAt: null,
};
