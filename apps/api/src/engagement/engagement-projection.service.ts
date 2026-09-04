import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  DAILY_STREAK_POLICY,
  COLLECTION_LISTENING_POINTS,
  dailyStreakReviewTarget,
  PODCAST_COMPLETION_POINTS,
  PODCAST_WORD_RETRIEVAL_POINTS,
  REVIEW_LEARNING_POINTS,
  STORY_COMPLETION_POINTS,
  streakFreezeGrantMilestone,
  type UserSettings,
} from '@lingua-card/shared/domain';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { DailyReviewCardEntity } from './entities/daily-review-card.entity';
import { EngagementProcessedEventEntity } from './entities/engagement-processed-event.entity';
import { RewardReason, RewardTransactionEntity } from './entities/reward-transaction.entity';
import { buildServerRewardAwards } from './engagement-reward-policy';
import { StreakFreezeTransactionEntity } from './entities/streak-freeze-transaction.entity';

const REWARD_POINTS: Readonly<Record<RewardReason, number>> = {
  first_daily_card_review: REVIEW_LEARNING_POINTS.firstUniqueDailyReview,
  recovered_card_review: REVIEW_LEARNING_POINTS.recoveredRecall,
  daily_goal_completed: REVIEW_LEARNING_POINTS.dailyStreakCompleted,
  earned_card_mastery: REVIEW_LEARNING_POINTS.cardMastered,
  podcast_episode_completed: PODCAST_COMPLETION_POINTS,
  podcast_word_retrieved: PODCAST_WORD_RETRIEVAL_POINTS,
  collection_listening_completed: COLLECTION_LISTENING_POINTS,
  story_completed: STORY_COMPLETION_POINTS,
};

export interface ServerReviewCommittedEvent extends Record<string, unknown> {
  eventId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: string;
  becameMastered: boolean;
  rating: 'again' | 'hard' | 'good' | 'easy';
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
    settings: Pick<UserSettings, 'timezone'>,
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
    const eligibleCardRows: Array<{ count: number }> = await manager.query(`
      SELECT COUNT(card.id)::int AS count
      FROM cards card
      INNER JOIN review_scheduling scheduling ON scheduling."cardId" = card.id
      WHERE card."userId" = $1
        AND COALESCE(scheduling.state->>'masterySource', '') <> 'manual'
    `, [userId]);
    const eligibleCardCount = Math.max(1, eligibleCardRows[0]?.count ?? 0);
    await progressRepository.createQueryBuilder().insert().values({
      userId,
      dayKey,
      streakPolicyVersion: DAILY_STREAK_POLICY.version,
      targetUniqueCards: dailyStreakReviewTarget(eligibleCardCount),
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

    if (reachedNow) await this.grantStreakFreezeForMilestone(manager, userId, event);

    const sourcePodcastEpisodeId = addedUniqueCard && (event.rating === 'good' || event.rating === 'easy')
      ? await this.sourcePodcastEpisodeId(manager, userId, event.cardId)
      : null;
    const recoveredAfterIncorrect = event.rating === 'good' || event.rating === 'easy'
      ? await this.hadEarlierIncorrectAttempt(manager, userId, dayKey, settings.timezone, event)
      : false;

    for (const award of buildServerRewardAwards({
      userId, dayKey, event, addedUniqueCard, reachedGoalNow: reachedNow,
      sourcePodcastEpisodeId, recoveredAfterIncorrect,
    })) {
      await this.insertReward(manager, {
        userId, dayKey, event, reason: award.reason,
        deduplicationKey: award.deduplicationKey,
        cardId: award.cardId,
      });
    }
  }

  private async hadEarlierIncorrectAttempt(
    manager: EntityManager,
    userId: string,
    dayKey: string,
    timeZone: string,
    event: ServerReviewCommittedEvent,
  ): Promise<boolean> {
    const rows: Array<{ found: boolean }> = await manager.query(`
      SELECT EXISTS (
        SELECT 1 FROM review_commits commit
        WHERE commit."userId" = $1
          AND commit."cardId" = $2
          AND commit."reviewedAt" < $3
          AND (commit."reviewedAt" AT TIME ZONE $4)::date = $5::date
          AND commit.event->>'rating' = 'again'
      ) AS found
    `, [userId, event.cardId, event.reviewedAt, timeZone, dayKey]);
    return rows[0]?.found ?? false;
  }

  private async sourcePodcastEpisodeId(
    manager: EntityManager,
    userId: string,
    cardId: string,
  ): Promise<string | null> {
    const rows: Array<{ sourcePodcastEpisodeId: string }> = await manager.query(`
      SELECT collection."sourcePodcastEpisodeId"
      FROM learning_items item
      INNER JOIN user_collection_items membership ON membership."learningItemId" = item.id
      INNER JOIN collections collection ON collection.id = membership."collectionId"
      WHERE item."userId" = $1
        AND (item.id = $2 OR item."legacyCardId" = $2)
        AND collection."sourcePodcastEpisodeId" IS NOT NULL
      ORDER BY collection."sourcePodcastEpisodeId"
      LIMIT 1
    `, [userId, cardId]);
    return rows[0]?.sourcePodcastEpisodeId ?? null;
  }

  private async grantStreakFreezeForMilestone(
    manager: EntityManager,
    userId: string,
    event: ServerReviewCommittedEvent,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`streak-freeze:${userId}`]);
    const qualifyingGoalDayCount = await manager.getRepository(DailyProgressEntity)
      .createQueryBuilder('progress')
      .where('progress.userId = :userId', { userId })
      .andWhere('progress.uniqueCardsReviewed >= progress.targetUniqueCards')
      .getCount();
    const freezeRepository = manager.getRepository(StreakFreezeTransactionEntity);
    const inventoryRow = await freezeRepository.createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'total')
      .where('transaction.userId = :userId', { userId })
      .getRawOne<{ total: string }>();
    const milestone = streakFreezeGrantMilestone(
      qualifyingGoalDayCount,
      Number(inventoryRow?.total ?? 0),
    );
    if (milestone === null) return;

    const sourceId = `freeze-earned:${userId}:milestone:${milestone}`;
    await freezeRepository.createQueryBuilder().insert().values({
      transactionId: sourceId,
      userId,
      occurredAt: new Date(event.reviewedAt),
      amount: 1,
      reason: 'granted',
      protectedDayKey: null,
      sourceId,
    }).orIgnore().execute();
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
