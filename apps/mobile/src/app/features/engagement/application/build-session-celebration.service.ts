import { inject, Injectable } from '@angular/core';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { deserializeReviewCommittedEvent } from '../../review/domain/review-persistence';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { buildSessionCelebration, SessionCelebration } from '../domain/engagement-domain';

@Injectable({ providedIn: 'root' })
export class BuildSessionCelebrationService {
  private readonly engagementRepository = inject(EngagementLocalRepository);
  private readonly reviewRepository = inject(ReviewLocalRepository);

  async build(userId: string, sessionId: string): Promise<SessionCelebration> {
    const [engagementState, persistedEvents] = await Promise.all([
      this.engagementRepository.state(userId),
      this.reviewRepository.committedEvents(userId),
    ]);
    const events = persistedEvents
      .map(deserializeReviewCommittedEvent)
      .filter(event => event.sessionId === sessionId)
      .sort((left, right) => left.reviewedAt.getTime() - right.reviewedAt.getTime());
    if (events.length === 0) throw new Error('A completed non-empty session is required for celebration');

    const engagementResults = events.map(event => engagementState.projectionResults[event.eventId]);
    if (engagementResults.some(result => result === undefined)) {
      throw new Error('Session engagement projection is incomplete');
    }
    const projectedResults = engagementResults.filter(result => result !== undefined);
    const finalResult = projectedResults.at(-1);
    if (!finalResult) throw new Error('Session engagement projection is incomplete');

    return buildSessionCelebration({
      sessionId,
      committedReviewCount: events.length,
      uniqueCardsReviewedInSession: new Set(events.map(event => event.cardId)).size,
      engagementResults: projectedResults,
      dailyProgressAtCompletion: finalResult.dailyProgress,
      streakAtCompletion: finalResult.streak,
      learningPointsBalance: engagementState.rewardTransactions.reduce(
        (total, transaction) => total + transaction.amount,
        0,
      ),
    });
  }
}
