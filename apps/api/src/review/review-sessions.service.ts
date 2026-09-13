import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReviewSession } from '@lingua-card/shared/domain';
import { reviewHistoryCutoff } from '@lingua-card/shared/utils';
import { ReviewSessionEntity } from './review-session.entity';
import { ReviewHistoryClearanceEntity } from './review-history-clearance.entity';
import { UpsertReviewSessionDto } from './review-session.dto';

@Injectable()
export class ReviewSessionsService {
  constructor(
    @InjectRepository(ReviewSessionEntity)
    private readonly repo: Repository<ReviewSessionEntity>,
    @InjectRepository(ReviewHistoryClearanceEntity)
    private readonly clearances: Repository<ReviewHistoryClearanceEntity>,
  ) {}

  /**
   * Upsert a session. Called when the client flushes a completed session.
   * Uses INSERT … ON CONFLICT (id) DO UPDATE so re-syncs are idempotent.
   */
  async upsert(userId: string, dto: UpsertReviewSessionDto): Promise<ReviewSession> {
    if (new Date(dto.startedAt) < reviewHistoryCutoff()) {
      throw new BadRequestException('Review session is older than three months');
    }
    const clearance = await this.clearances.findOneBy({ userId });
    if (clearance && new Date(dto.startedAt) <= clearance.clearedAt) {
      throw new BadRequestException('Review session predates cleared history');
    }
    if (dto.reviewedCards > dto.totalCards || (dto.newCards ?? 0) > dto.totalCards) {
      throw new BadRequestException('Review session counters are inconsistent');
    }
    if (!Object.values(dto.ratings).every(isReviewRating)) {
      throw new BadRequestException('Review session contains an invalid rating');
    }
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ReviewSessionEntity)
      .values({
        id: dto.id,
        userId,
        deckId: dto.deckId ?? 'default',
        collectionId: dto.collectionId ?? null,
        collectionName: dto.collectionName ?? null,
        startedAt: dto.startedAt,
        completedAt: dto.completedAt ?? null,
        totalCards: dto.totalCards,
        reviewedCards: dto.reviewedCards,
        newCards: dto.newCards ?? 0,
        ratings: dto.ratings,
      })
      .orUpdate(
        ['completedAt', 'totalCards', 'reviewedCards', 'newCards', 'ratings'],
        ['id'],
      )
      .execute();

    const saved = await this.repo.findOneByOrFail({ id: dto.id, userId });
    return this.toModel(saved);
  }

  /** Batch upsert — used when the offline sync queue flushes multiple sessions. */
  async upsertBatch(userId: string, sessions: UpsertReviewSessionDto[]): Promise<{ upserted: number }> {
    const cutoff = reviewHistoryCutoff();
    const clearance = await this.clearances.findOneBy({ userId });
    const recent = sessions.filter(session =>
      new Date(session.startedAt) >= cutoff
      && (!clearance || new Date(session.startedAt) > clearance.clearedAt));
    for (const s of recent) {
      await this.upsert(userId, s);
    }
    return { upserted: recent.length };
  }

  /** Return the most recent N sessions for a user (default 50). */
  async findRecent(userId: string, limit = 50): Promise<ReviewSession[]> {
    const rows = await this.repo.createQueryBuilder('session')
      .leftJoin(ReviewHistoryClearanceEntity, 'clearance', 'clearance."userId" = session."userId"')
      .where('session."userId" = :userId', { userId })
      .andWhere('session."startedAt"::timestamptz >= :cutoff', { cutoff: reviewHistoryCutoff().toISOString() })
      .andWhere('(clearance."clearedAt" IS NULL OR session."startedAt"::timestamptz > clearance."clearedAt")')
      .orderBy('session."startedAt"::timestamptz', 'DESC')
      .limit(Math.min(Math.max(Math.trunc(limit), 1), 500))
      .getMany();
    return rows.map(this.toModel);
  }

  async clearHistory(userId: string): Promise<void> {
    await this.clearances.upsert({ userId, clearedAt: new Date() }, ['userId']);
    await this.repo.delete({ userId });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeExpired(): Promise<void> {
    await this.repo.createQueryBuilder()
      .delete()
      .where('"startedAt"::timestamptz < :cutoff OR EXISTS (SELECT 1 FROM "review_history_clearances" clearance WHERE clearance."userId" = "review_sessions"."userId" AND "review_sessions"."startedAt"::timestamptz <= clearance."clearedAt")', { cutoff: reviewHistoryCutoff().toISOString() })
      .execute();
  }

  private toModel(e: ReviewSessionEntity): ReviewSession {
    return {
      id: e.id,
      userId: e.userId,
      deckId: e.deckId,
      collectionId: e.collectionId,
      collectionName: e.collectionName,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      totalCards: e.totalCards,
      reviewedCards: e.reviewedCards,
      newCards: e.newCards,
      ratings: e.ratings,
    };
  }
}

function isReviewRating(value: unknown): boolean {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
}
