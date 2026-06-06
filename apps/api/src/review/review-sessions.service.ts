import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReviewSession } from '@lingua-card/shared/domain';
import { ReviewSessionEntity } from './review-session.entity';

export interface UpsertSessionDto {
  id: string;
  deckId?: string;
  collectionId?: string | null;
  collectionName?: string | null;
  startedAt: string;
  completedAt: string | null;
  totalCards: number;
  reviewedCards: number;
  newCards?: number;
  ratings: Record<string, number>;
}

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
  async upsert(userId: string, dto: UpsertSessionDto): Promise<ReviewSession> {
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
        ratings: dto.ratings as Record<string, import('@lingua-card/shared/domain').ConfidenceRating>,
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
  async upsertBatch(userId: string, sessions: UpsertSessionDto[]): Promise<{ upserted: number }> {
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
