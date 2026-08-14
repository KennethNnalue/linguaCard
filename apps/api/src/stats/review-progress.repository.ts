import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewCommitEntity } from '../review/review-commit.entity';

export interface DailyReviewProgressRow {
  dayKey: string;
  committedReviews: number;
  uniqueCardsReviewed: number;
}

@Injectable()
export class ReviewProgressRepository {
  constructor(
    @InjectRepository(ReviewCommitEntity)
    private readonly commits: Repository<ReviewCommitEntity>,
  ) {}

  dailyProgress(userId: string, timezone: string): Promise<DailyReviewProgressRow[]> {
    return this.commits
      .createQueryBuilder('commit')
      .select(`to_char(commit."reviewedAt" AT TIME ZONE :timezone, 'YYYY-MM-DD')`, 'dayKey')
      .addSelect('COUNT(*)::int', 'committedReviews')
      .addSelect('COUNT(DISTINCT commit."cardId")::int', 'uniqueCardsReviewed')
      .where('commit."userId" = :userId', { userId })
      .setParameter('timezone', timezone)
      .groupBy(`to_char(commit."reviewedAt" AT TIME ZONE :timezone, 'YYYY-MM-DD')`)
      .orderBy(`to_char(commit."reviewedAt" AT TIME ZONE :timezone, 'YYYY-MM-DD')`, 'ASC')
      .getRawMany<DailyReviewProgressRow>();
  }
}
