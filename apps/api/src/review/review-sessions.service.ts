import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReviewSession } from '@lingua-card/shared/domain';
import { ReviewSessionEntity } from './review-session.entity';
import { UpsertReviewSessionDto } from './review-session.dto';

@Injectable()
export class ReviewSessionsService {
  constructor(
    @InjectRepository(ReviewSessionEntity)
    private readonly repo: Repository<ReviewSessionEntity>,
  ) {}

  /**
   * Upsert a session. Called when the client flushes a completed session.
   * Uses INSERT … ON CONFLICT (id) DO UPDATE so re-syncs are idempotent.
   */
  async upsert(userId: string, dto: UpsertReviewSessionDto): Promise<ReviewSession> {
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
    for (const s of sessions) {
      await this.upsert(userId, s);
    }
    return { upserted: sessions.length };
  }

  /** Return the most recent N sessions for a user (default 50). */
  async findRecent(userId: string, limit = 50): Promise<ReviewSession[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
    return rows.map(this.toModel);
  }

  private toModel(e: ReviewSessionEntity): ReviewSession {
    return {
      id: e.id,
      userId: e.userId,
      deckId: e.deckId,
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
