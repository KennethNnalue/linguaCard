import { inject, Injectable } from '@angular/core';
import { ReviewRating, ScheduledCard } from '@lingua-card/shared/domain';
import { generateUuid } from '@lingua-card/shared/utils';
import { commitReview, PromptDirection, ReviewMode, ReviewResponseType } from '../domain/review-domain';
import { PendingReviewCommit, schedulingStateFor, toPendingReviewCommit } from '../domain/review-persistence';
import { ReviewLocalRepository } from './review-local.repository';

export interface CommitLocalReviewRequest {
  userId: string;
  card: ScheduledCard;
  sessionId: string;
  rating: ReviewRating;
  reviewMode: ReviewMode;
  promptDirection: PromptDirection;
  responseType: ReviewResponseType;
  answerEvaluation?: import('../domain/review-domain').AnswerEvaluation;
}

@Injectable({ providedIn: 'root' })
export class ReviewCommitService {
  private readonly repository = inject(ReviewLocalRepository);
  private lastReviewTimestamp = 0;

  async commit(request: CommitLocalReviewRequest): Promise<PendingReviewCommit> {
    const timestamp = Math.max(Date.now(), this.lastReviewTimestamp + 1);
    this.lastReviewTimestamp = timestamp;
    const committed = commitReview(schedulingStateFor(request.card), {
      reviewId: generateUuid(),
      eventId: generateUuid(),
      attemptId: generateUuid(),
      sessionId: request.sessionId,
      reviewedAt: new Date(timestamp),
      reviewMode: request.reviewMode,
      promptDirection: request.promptDirection,
      responseType: request.responseType,
      rating: request.rating,
      answerEvaluation: request.answerEvaluation,
    });
    const pending = toPendingReviewCommit(committed.event, committed.record, committed.schedule.nextState);
    await this.repository.commit(request.userId, pending);
    return pending;
  }
}
