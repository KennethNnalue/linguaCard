import { DailyProgress } from '../daily-progress/daily-progress';
import { DailyGoalReachedFeedback } from '../feedback/engagement-feedback';
import { RewardTransaction } from '../rewards/reward-transaction';
import { Streak } from '../streak/streak';
import { EngagementDayKey } from './engagement-date';

export interface EngagementProjectionResult {
  eventId: string;
  dayKey: EngagementDayKey;
  dailyProgress: DailyProgress;
  streak: Streak;
  rewardTransactions: readonly RewardTransaction[];
  pointsAwarded: number;
  feedback?: DailyGoalReachedFeedback;
}
