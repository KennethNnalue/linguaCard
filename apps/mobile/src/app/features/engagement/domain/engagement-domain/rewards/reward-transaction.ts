import { EngagementDayKey } from '../shared/engagement-date';

export type RewardReason = 'first_daily_card_review' | 'daily_goal_completed' | 'earned_card_mastery';
export interface RewardTransaction {
  transactionId: string;
  userId: string;
  occurredAt: Date;
  dayKey: EngagementDayKey;
  amount: number;
  reason: RewardReason;
  sourceEventId: string;
  deduplicationKey: string;
  sessionId?: string;
  cardId?: string;
}
