import { DailyProgress, DailyProgressTransition } from './daily-progress';
import { EngagementDayKey } from '../shared/engagement-date';
import { ReviewCommittedEvent } from '../shared/engagement-event';

export function applyReviewToDailyProgress(
  current: DailyProgress,
  event: ReviewCommittedEvent,
  dayKey: EngagementDayKey,
): DailyProgressTransition {
  if (current.dayKey !== dayKey) throw new Error('Daily progress and contribution must have the same day key');
  const addedUniqueCard = !current.reviewedCardIds.includes(event.cardId);
  const reviewedCardIds = addedUniqueCard ? [...current.reviewedCardIds, event.cardId] : [...current.reviewedCardIds];
  const wasReached = current.uniqueCardsReviewed >= current.targetUniqueCards;
  const uniqueCardsReviewed = reviewedCardIds.length;
  const reachedNow = !wasReached && uniqueCardsReviewed >= current.targetUniqueCards;
  const next: DailyProgress = {
    ...current,
    reviewedCardIds,
    uniqueCardsReviewed,
    committedReviewCount: current.committedReviewCount + 1,
    goalReachedAt: reachedNow ? new Date(event.reviewedAt.getTime()) : current.goalReachedAt,
    firstGoalReachingEventId: reachedNow ? event.eventId : current.firstGoalReachingEventId,
  };
  return {
    previous: current,
    next,
    contribution: { eventId: event.eventId, cardId: event.cardId, addedUniqueCard, addedCommittedReview: true },
    goalTransition: reachedNow ? 'reached_now' : wasReached ? 'already_reached' : 'not_reached',
  };
}
