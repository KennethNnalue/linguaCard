import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CardEntity } from '../cards/card.entity';
import { ReviewCommitEntity } from './review-commit.entity';
import { parseReviewCommit } from './review-commit.parser';
import { ReviewSchedulingEntity } from './review-scheduling.entity';
import { EngagementProjectionService } from '../engagement/engagement-projection.service';
import { UserSettingsService } from '../settings/user-settings.service';

@Injectable()
export class ReviewCommitsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly engagement: EngagementProjectionService,
    private readonly settings: UserSettingsService,
  ) {}

  async commitBatch(userId: string, values: unknown[]): Promise<{ accepted: number; duplicates: number }> {
    const commits = values.map(parseReviewCommit).sort((left, right) =>
      left.event.reviewedAt.localeCompare(right.event.reviewedAt),
    );
    const engagementSettings = await this.settings.getForUser(userId);
    let accepted = 0;

    await this.dataSource.transaction(async manager => {
      const commitRepository = manager.getRepository(ReviewCommitEntity);
      const cardRepository = manager.getRepository(CardEntity);
      const schedulingRepository = manager.getRepository(ReviewSchedulingEntity);
      for (const commit of commits) {
        const card = await cardRepository.findOneBy({ id: commit.event.cardId, userId });
        if (!card) throw new BadRequestException(`Card ${commit.event.cardId} is unavailable`);
        const entity = commitRepository.create({
          eventId: commit.event.eventId,
          attemptId: commit.event.attemptId,
          reviewId: commit.event.reviewId,
          userId,
          cardId: commit.event.cardId,
          sessionId: commit.event.sessionId,
          reviewedAt: new Date(commit.event.reviewedAt),
          event: commit.event,
          record: commit.record,
          nextState: commit.nextState,
        });
        const insert = await commitRepository
          .createQueryBuilder()
          .insert()
          .values(entity)
          .orIgnore()
          .returning(['eventId'])
          .execute();
        if (!Array.isArray(insert.raw) || insert.raw.length === 0) continue;
        accepted += 1;
        const reviewedAt = new Date(commit.event.reviewedAt);
        await schedulingRepository
          .createQueryBuilder()
          .update(ReviewSchedulingEntity)
          .set({ state: commit.nextState, stateUpdatedAt: reviewedAt })
          .where('"cardId" = :cardId', { cardId: card.id })
          .andWhere('(\"stateUpdatedAt\" IS NULL OR \"stateUpdatedAt\" < :reviewedAt)', { reviewedAt })
          .execute();
      }
    });

    await this.dataSource.transaction(async manager => {
      for (const commit of commits) {
        await this.engagement.projectCommittedReview(manager, userId, commit.event, engagementSettings);
      }
    });

    return { accepted, duplicates: commits.length - accepted };
  }
}
