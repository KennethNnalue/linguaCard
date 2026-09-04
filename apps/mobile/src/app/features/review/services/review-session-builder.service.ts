import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter, take } from 'rxjs';
import { CardStore } from '../../vault/store/card.store';
import { AuthService } from '../../../core/services/auth.service';
import { deserializeSchedulingState } from '../domain/review-persistence';
import { ReviewLocalRepository } from './review-local.repository';
import {
  ApplicationError,
  DEFAULT_DAILY_NEW_CARD_LIMIT,
  DEFAULT_NEW_CARD_RATIO,
  ReviewCandidate,
  ReviewSessionRequest,
  SessionBuilderPolicy,
  StartSessionResult,
  buildReviewSession,
  remainingDailyNewCardLimit,
} from '../domain/session-builder';

export interface ReviewSessionStartOptions {
  policy?: SessionBuilderPolicy;
  timeZone: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewSessionBuilderService {
  private readonly cardStore = inject(CardStore);
  private readonly authService = inject(AuthService);
  private readonly reviewLocal = inject(ReviewLocalRepository);
  private readonly loadState$ = toObservable(this.cardStore.loadState);

  async start(
    request: ReviewSessionRequest,
    now: Date,
    sessionId: string,
    options: ReviewSessionStartOptions,
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
    const resolvedPolicy = options.policy ?? await this.dailyPolicy(now, options.timeZone);
    return buildReviewSession(candidates, request, resolvedPolicy, now, sessionId);
  }

  private async dailyPolicy(now: Date, timeZone: string): Promise<SessionBuilderPolicy> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { newCardLimit: DEFAULT_DAILY_NEW_CARD_LIMIT, newCardRatio: DEFAULT_NEW_CARD_RATIO };

    let events: Awaited<ReturnType<ReviewLocalRepository['committedEvents']>>;
    try {
      events = await this.reviewLocal.committedEvents(userId);
    } catch {
      return { newCardLimit: DEFAULT_DAILY_NEW_CARD_LIMIT, newCardRatio: DEFAULT_NEW_CARD_RATIO };
    }
    let newCardLimit: number;
    try {
      newCardLimit = remainingDailyNewCardLimit(events, now, DEFAULT_DAILY_NEW_CARD_LIMIT, timeZone);
    } catch {
      newCardLimit = remainingDailyNewCardLimit(
        events,
        now,
        DEFAULT_DAILY_NEW_CARD_LIMIT,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
    }
    return { newCardLimit, newCardRatio: DEFAULT_NEW_CARD_RATIO };
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
