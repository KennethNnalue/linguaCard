import { DailyProgressTransition } from '../daily-progress/daily-progress';
import { EngagementDayKey } from '../shared/engagement-date';
import { ReviewCommittedEvent } from '../shared/engagement-event';
import { RewardPolicy } from './reward-policy';
import { RewardReason, RewardTransaction } from './reward-transaction';

export interface ApplyRewardPolicyInput {
  userId: string;
  event: ReviewCommittedEvent;
  dailyProgressTransition: DailyProgressTransition;
  dayKey: EngagementDayKey;
  policy: RewardPolicy;
  transactionId(reason: RewardReason): string;
}

export function applyRewardPolicy(input: ApplyRewardPolicyInput): readonly RewardTransaction[] {
  const { userId, event, dailyProgressTransition, dayKey, policy } = input;
  const transactions: RewardTransaction[] = [];
  const add = (reason: RewardReason, amount: number, deduplicationKey: string, cardId?: string): void => {
    if (amount <= 0) return;
    transactions.push({
      transactionId: input.transactionId(reason), userId, occurredAt: new Date(event.reviewedAt.getTime()),
      dayKey, amount, reason, sourceEventId: event.eventId, deduplicationKey, sessionId: event.sessionId, cardId,
    });
  };
  if (dailyProgressTransition.contribution.addedUniqueCard) {
    add('first_daily_card_review', policy.firstDailyCardReviewPoints, `review-card:${userId}:${dayKey}:${event.cardId}`, event.cardId);
  }
  if (dailyProgressTransition.goalTransition === 'reached_now') {
    add('daily_goal_completed', policy.dailyGoalCompletionPoints, `daily-goal:${userId}:${dayKey}`);
  }
  if (event.becameMastered) {
    add('earned_card_mastery', policy.earnedMasteryPoints, `earned-mastery:${event.eventId}`, event.cardId);
  }
  return transactions;
}
