import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter, take } from 'rxjs';
import { CardStore } from '../../vault/store/card.store';
import { deserializeSchedulingState } from '../domain/review-persistence';
import {
  ApplicationError,
  ReviewCandidate,
  ReviewSessionRequest,
  SessionBuilderPolicy,
  StartSessionResult,
  buildReviewSession,
} from '../domain/session-builder';

const DEFAULT_POLICY: SessionBuilderPolicy = { newCardLimit: 10 };

@Injectable({ providedIn: 'root' })
export class ReviewSessionBuilderService {
  private readonly cardStore = inject(CardStore);
  private readonly loadState$ = toObservable(this.cardStore.loadState);

  async start(
    request: ReviewSessionRequest,
    now: Date,
    sessionId: string,
    policy: SessionBuilderPolicy = DEFAULT_POLICY,
  ): Promise<StartSessionResult> {
    const readiness = await this.awaitCardReadiness();
    if (readiness) return { kind: 'load_failed', error: readiness };

    const candidates: ReviewCandidate[] = [];
    for (const card of this.cardStore.cards()) {
      candidates.push({
        cardId: card.id,
        collectionId: card.collectionId,
        createdAt: new Date(card.createdAt),
        scheduling: deserializeSchedulingState(card.reviewState),
      });
    }
    return buildReviewSession(candidates, request, policy, now, sessionId);
  }

  private async awaitCardReadiness(): Promise<ApplicationError | null> {
    let state = this.cardStore.loadState();
    if (state.status === 'idle' || state.status === 'error') {
      state = await this.cardStore.loadCards();
    } else if (state.status === 'loading') {
      state = await firstValueFrom(this.loadState$.pipe(
        filter(candidate => candidate.status !== 'loading'),
        take(1),
      ));
    }
    if (state.status === 'ready') return null;
    return { code: 'cards_unavailable', message: 'Cards are not ready for review.' };
  }
}
