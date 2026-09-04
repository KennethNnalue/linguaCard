import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { COLLECTION_LISTENING_POINTS, STORY_COMPLETION_POINTS } from '@lingua-card/shared/domain';
import { DataSource, EntityManager } from 'typeorm';
import { CollectionEntity } from '../collections/collection.entity';
import { StoryEntity } from '../stories/story.entity';
import { UserSettingsService } from '../settings/user-settings.service';
import { RewardReason, RewardTransactionEntity } from './entities/reward-transaction.entity';

export interface EngagementCompletionResult {
  pointsAwarded: number;
}

@Injectable()
export class EngagementCompletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: UserSettingsService,
  ) {}

  async completeCollectionListening(
    userId: string,
    collectionId: string,
    cardIds: readonly string[],
  ): Promise<EngagementCompletionResult> {
    const distinctCardIds = [...new Set(cardIds)];
    if (distinctCardIds.length < 5) {
      throw new BadRequestException('At least five distinct completed cards are required');
    }
    const settings = await this.settings.getForUser(userId);
    return this.dataSource.transaction(async manager => {
      const collection = await manager.findOneBy(CollectionEntity, { id: collectionId, userId });
      if (!collection) throw new NotFoundException(`Collection ${collectionId} not found`);
      const rows: Array<{ count: number }> = await manager.query(`
        SELECT COUNT(card.id)::int AS count
        FROM cards card
        WHERE card."userId" = $1
          AND card."collectionId" = $2
          AND card.id = ANY($3::varchar[])
      `, [userId, collectionId, distinctCardIds]);
      if ((rows[0]?.count ?? 0) !== distinctCardIds.length) {
        throw new BadRequestException('Every completed card must belong to the collection');
      }
      const occurredAt = new Date();
      const dayKey = this.dayKey(occurredAt, settings.timezone);
      const pointsAwarded = await this.insertReward(manager, {
        userId,
        occurredAt,
        dayKey,
        points: COLLECTION_LISTENING_POINTS,
        reason: 'collection_listening_completed',
        sourceId: `collection-listening:${userId}:${collectionId}:${dayKey}`,
      });
      return { pointsAwarded };
    });
  }

  async completeStory(
    userId: string,
    storyId: string,
    sentenceIndexes: readonly number[],
  ): Promise<EngagementCompletionResult> {
    const settings = await this.settings.getForUser(userId);
    return this.dataSource.transaction(async manager => {
      const story = await manager.findOneBy(StoryEntity, { id: storyId, userId });
      if (!story) throw new NotFoundException(`Story ${storyId} not found`);
      const submitted = new Set(sentenceIndexes);
      if (story.sentences.length === 0 || story.sentences.some(sentence => !submitted.has(sentence.index))) {
        throw new BadRequestException('Every story sentence must be completed');
      }
      const occurredAt = new Date();
      const pointsAwarded = await this.insertReward(manager, {
        userId,
        occurredAt,
        dayKey: this.dayKey(occurredAt, settings.timezone),
        points: STORY_COMPLETION_POINTS,
        reason: 'story_completed',
        sourceId: `story-completed:${userId}:${storyId}`,
      });
      return { pointsAwarded };
    });
  }

  private async insertReward(manager: EntityManager, input: {
    userId: string;
    occurredAt: Date;
    dayKey: string;
    points: number;
    reason: RewardReason;
    sourceId: string;
  }): Promise<number> {
    const result = await manager.getRepository(RewardTransactionEntity).createQueryBuilder().insert().values({
      transactionId: input.sourceId,
      userId: input.userId,
      occurredAt: input.occurredAt,
      dayKey: input.dayKey,
      amount: input.points,
      reason: input.reason,
      sourceEventId: input.sourceId,
      deduplicationKey: input.sourceId,
      sessionId: null,
      cardId: null,
    }).orIgnore().returning(['transactionId']).execute();
    return Array.isArray(result.raw) && result.raw.length > 0 ? input.points : 0;
  }

  private dayKey(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at);
  }
}
