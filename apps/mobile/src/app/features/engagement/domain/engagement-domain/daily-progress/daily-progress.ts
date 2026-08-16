import { EngagementDayKey } from '../shared/engagement-date';

export interface DailyProgress {
  userId: string;
  dayKey: EngagementDayKey;
  targetUniqueCards: number;
  reviewedCardIds: readonly string[];
  uniqueCardsReviewed: number;
  committedReviewCount: number;
  goalReachedAt?: Date;
  firstGoalReachingEventId?: string;
}

export interface DailyProgressTransition {
  previous: DailyProgress;
  next: DailyProgress;
  contribution: { eventId: string; cardId: string; addedUniqueCard: boolean; addedCommittedReview: true };
  goalTransition: 'not_reached' | 'reached_now' | 'already_reached';
}
