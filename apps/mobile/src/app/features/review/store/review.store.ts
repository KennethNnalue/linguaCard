import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { CardApiService } from '../../vault/services/card-api.service';
import { Sm2Service } from '../../../shared/srs/sm2.service';

export interface ReviewSession {
  id: string;
  startedAt: string;
  completedAt: string;
  totalCards: number;
  ratings: Record<string, ConfidenceRating>;
  collectionId: string | null;
  collectionName: string | null;
  reviewedCards: Card[];
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly cardApi = inject(CardApiService);
  private readonly sm2 = inject(Sm2Service);

  private readonly _activeSession = signal<ReviewSession | null>(null);
  private readonly _completedSession = signal<ReviewSession | null>(null);
  private readonly _sessionHistory = signal<ReviewSession[]>([]);
  private readonly _pendingQueue = signal<Card[]>([]);

  readonly activeSession = this._activeSession.asReadonly();
  readonly completedSession = this._completedSession.asReadonly();
  readonly sessionHistory = this._sessionHistory.asReadonly();
  readonly pendingQueue = this._pendingQueue.asReadonly();

  startSession(cards: Card[], collectionId: string | null, collectionName: string | null): void {
    this._completedSession.set(null);
    this._pendingQueue.set(cards);
    this._activeSession.set({
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      completedAt: '',
      totalCards: cards.length,
      ratings: {},
      collectionId,
      collectionName,
      reviewedCards: [],
    });
  }

  rateCard(card: Card, rating: ConfidenceRating): Observable<Card> {
    this._activeSession.update(s => {
      if (!s) return s;
      return { ...s, ratings: { ...s.ratings, [card.id]: rating } };
    });

    const existingSrs = card.srsState ?? this.sm2.freshState(card.id, card.userId);
    const newSrs = this.sm2.compute(existingSrs, rating);
    return this.cardApi.update(card.id, { srsState: newSrs, updatedAt: new Date().toISOString() });
  }

  completeSession(finalQueue: Card[]): void {
    const active = this._activeSession();
    if (!active) return;
    const completed: ReviewSession = {
      ...active,
      completedAt: new Date().toISOString(),
      reviewedCards: finalQueue,
    };
    this._completedSession.set(completed);
    this._activeSession.set(null);
    this._pendingQueue.set([]);
    this._sessionHistory.update(history => [completed, ...history]);
  }

  clearSession(): void {
    this._completedSession.set(null);
  }

}
