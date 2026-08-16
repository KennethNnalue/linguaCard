import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { UserSettings } from '@lingua-card/shared/domain';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { DailyReviewCardEntity } from './entities/daily-review-card.entity';
import { EngagementProcessedEventEntity } from './entities/engagement-processed-event.entity';
import { RewardReason, RewardTransactionEntity } from './entities/reward-transaction.entity';
import { buildServerRewardAwards } from './engagement-reward-policy';

const REWARD_POINTS: Readonly<Record<RewardReason, number>> = {
  first_daily_card_review: 1,
  daily_goal_completed: 10,
  earned_card_mastery: 5,
};

export interface ServerReviewCommittedEvent extends Record<string, unknown> {
  eventId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: string;
  becameMastered: boolean;
}

function resolveDayKey(reviewedAt: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(reviewedAt));
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    throw new Error('A valid IANA timezone is required for engagement projection');
  }
}

@Injectable()
export class EngagementProjectionService {
  async projectCommittedReview(
    manager: EntityManager,
    userId: string,
    event: ServerReviewCommittedEvent,
    settings: Pick<UserSettings, 'dailyGoal' | 'timezone'>,
  ): Promise<void> {
    const dayKey = resolveDayKey(event.reviewedAt, settings.timezone);
    const processedRepository = manager.getRepository(EngagementProcessedEventEntity);
    const processedInsert = await processedRepository.createQueryBuilder().insert().values({
      userId, eventId: event.eventId, dayKey,
    }).orIgnore().returning(['eventId']).execute();
    if (!Array.isArray(processedInsert.raw) || processedInsert.raw.length === 0) return;

    const dailyCardRepository = manager.getRepository(DailyReviewCardEntity);
    const dailyCardInsert = await dailyCardRepository.createQueryBuilder().insert().values({
      userId, dayKey, cardId: event.cardId, sourceEventId: event.eventId,
    }).orIgnore().returning(['cardId']).execute();
    const addedUniqueCard = Array.isArray(dailyCardInsert.raw) && dailyCardInsert.raw.length > 0;

    const progressRepository = manager.getRepository(DailyProgressEntity);
    await progressRepository.createQueryBuilder().insert().values({
      userId, dayKey, targetUniqueCards: settings.dailyGoal,
      uniqueCardsReviewed: 0, committedReviewCount: 0,
    }).orIgnore().execute();
    const progress = await progressRepository.findOne({
      where: { userId, dayKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!progress) throw new Error('Daily progress could not be locked');

    const wasReached = progress.uniqueCardsReviewed >= progress.targetUniqueCards;
    progress.committedReviewCount += 1;
    if (addedUniqueCard) progress.uniqueCardsReviewed += 1;
    const reachedNow = !wasReached && progress.uniqueCardsReviewed >= progress.targetUniqueCards;
    if (reachedNow) {
      progress.goalReachedAt = new Date(event.reviewedAt);
      progress.firstGoalReachingEventId = event.eventId;
    }
    await progressRepository.save(progress);

    for (const award of buildServerRewardAwards({
      userId, dayKey, event, addedUniqueCard, reachedGoalNow: reachedNow,
    })) {
      await this.insertReward(manager, {
        userId, dayKey, event, reason: award.reason,
        deduplicationKey: award.deduplicationKey,
        cardId: award.cardId,
      });
    }
  }

  private async insertReward(
    manager: EntityManager,
    input: {
      userId: string;
      dayKey: string;
      event: ServerReviewCommittedEvent;
      reason: RewardReason;
      deduplicationKey: string;
      cardId?: string;
    },
  ): Promise<void> {
    await manager.getRepository(RewardTransactionEntity).createQueryBuilder().insert().values({
      transactionId: `${input.event.eventId}:${input.reason}`,
      userId: input.userId,
      occurredAt: new Date(input.event.reviewedAt),
      dayKey: input.dayKey,
      amount: REWARD_POINTS[input.reason],
      reason: input.reason,
      sourceEventId: input.event.eventId,
      deduplicationKey: input.deduplicationKey,
      sessionId: input.event.sessionId,
      cardId: input.cardId ?? null,
    }).orIgnore().execute();
  }
}
