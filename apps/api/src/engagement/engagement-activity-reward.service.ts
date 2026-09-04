import { Injectable } from '@nestjs/common';
import { PODCAST_COMPLETION_POINTS } from '@lingua-card/shared/domain';
import type { EntityManager } from 'typeorm';
import { RewardTransactionEntity } from './entities/reward-transaction.entity';

@Injectable()
export class EngagementActivityRewardService {
  async awardPodcastCompletion(
    manager: EntityManager,
    userId: string,
    episodeId: string,
    occurredAt: Date,
    timeZone: string,
  ): Promise<number> {
    const sourceEventId = `podcast-completed:${userId}:${episodeId}`;
    const result = await manager.getRepository(RewardTransactionEntity).createQueryBuilder().insert().values({
      transactionId: sourceEventId,
      userId,
      occurredAt,
      dayKey: this.dayKey(occurredAt, timeZone),
      amount: PODCAST_COMPLETION_POINTS,
      reason: 'podcast_episode_completed',
      sourceEventId,
      deduplicationKey: sourceEventId,
      sessionId: null,
      cardId: null,
    }).orIgnore().returning(['transactionId']).execute();
    return Array.isArray(result.raw) && result.raw.length > 0 ? PODCAST_COMPLETION_POINTS : 0;
  }

  private dayKey(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at);
  }
}
