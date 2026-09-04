import { RewardReason } from './entities/reward-transaction.entity';
import { ServerReviewCommittedEvent } from './engagement-projection.service';

export interface ServerRewardAward {
  reason: RewardReason;
  deduplicationKey: string;
  cardId?: string;
}

export function buildServerRewardAwards(input: {
  userId: string;
  dayKey: string;
  event: ServerReviewCommittedEvent;
  addedUniqueCard: boolean;
  reachedGoalNow: boolean;
  sourcePodcastEpisodeId: string | null;
  recoveredAfterIncorrect: boolean;
}): readonly ServerRewardAward[] {
  const awards: ServerRewardAward[] = [];
  if (input.addedUniqueCard) {
    awards.push({
      reason: 'first_daily_card_review',
      deduplicationKey: `review-card:${input.userId}:${input.dayKey}:${input.event.cardId}`,
      cardId: input.event.cardId,
    });
  }
  if (input.reachedGoalNow) {
    awards.push({
      reason: 'daily_goal_completed',
      deduplicationKey: `daily-goal:${input.userId}:${input.dayKey}`,
    });
  }
  if (input.recoveredAfterIncorrect) {
    awards.push({
      reason: 'recovered_card_review',
      deduplicationKey: `recovered-review:${input.userId}:${input.dayKey}:${input.event.cardId}`,
      cardId: input.event.cardId,
    });
  }
  if (input.event.becameMastered) {
    awards.push({
      reason: 'earned_card_mastery',
      deduplicationKey: `earned-mastery:${input.event.eventId}`,
      cardId: input.event.cardId,
    });
  }
  if (input.sourcePodcastEpisodeId) {
    awards.push({
      reason: 'podcast_word_retrieved',
      deduplicationKey: `podcast-word-retrieved:${input.userId}:${input.sourcePodcastEpisodeId}:${input.event.cardId}`,
      cardId: input.event.cardId,
    });
  }
  return awards;
}
