import { inject, Injectable } from '@angular/core';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { isDue } from '../domain/review-status';
import type {
  ApplicationError,
  ReviewSessionRequest,
} from '../domain/session-builder';
import { estimateReviewMinutes } from './estimate-review-time';
import {
  ReviewSessionBuilderService,
  type ReviewSessionSelectionResult,
  type ReviewSessionStartOptions,
} from '../services/review-session-builder.service';

export interface ReviewSessionPlan {
  cardIds: readonly string[];
  dueCards: number;
  newCards: number;
  reviewCards: number;
  estimatedMinutes: number;
}

export type ReviewSessionPlanResult =
  | { kind: 'ready'; plan: ReviewSessionPlan }
  | Exclude<ReviewSessionSelectionResult, { kind: 'selected' }>;

@Injectable({ providedIn: 'root' })
export class ReviewSessionPlanningService {
  private readonly sessionBuilder = inject(ReviewSessionBuilderService);
  private readonly cardStore = inject(CardStore);

  async plan(
    request: ReviewSessionRequest,
    now: Date,
    options: ReviewSessionStartOptions,
  ): Promise<ReviewSessionPlanResult> {
    const selection = await this.sessionBuilder.select(request, now, options);
    if (selection.kind !== 'selected') return selection;

    const selectedCards = this.resolveSelectedCards(selection.cardIds);
    if (selectedCards instanceof Error) {
      const error: ApplicationError = {
        code: 'cards_unavailable',
        message: selectedCards.message,
      };
      return { kind: 'load_failed', error };
    }

    const newCards = selectedCards.filter(card => card.reviewState.stage === 'new').length;
    const reviewCards = selectedCards.length - newCards;
    const dueCards = selectedCards.filter(card => isDue(card, now)).length;

    return {
      kind: 'ready',
      plan: {
        cardIds: selection.cardIds,
        dueCards,
        newCards,
        reviewCards,
        estimatedMinutes: estimateReviewMinutes({
          newCards,
          reviewCards,
          mode: request.mode === 'typing' ? 'type' : 'flip',
        }),
      },
    };
  }

  private resolveSelectedCards(cardIds: readonly string[]): ScheduledCard[] | Error {
    const cardsById = new Map(this.cardStore.cards().map(card => [card.id, card]));
    const selectedCards: ScheduledCard[] = [];
    for (const cardId of cardIds) {
      const card = cardsById.get(cardId);
      if (!card) return new Error('The planned review cards are no longer available.');
      selectedCards.push(card);
    }
    return selectedCards;
  }
}
