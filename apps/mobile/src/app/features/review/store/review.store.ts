import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Card, ConfidenceRating, MasteryLevel, SRSStateData } from '../../../core/models/mock-data';
import { CardApiService } from '../../../core/services/card-api.service';

export interface ReviewSession {
  id: string;
  startedAt: string;
  totalCards: number;
  ratings: Record<string, ConfidenceRating>;
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly cardApi = inject(CardApiService);

  private readonly _activeSession = signal<ReviewSession | null>(null);
  readonly activeSession = this._activeSession.asReadonly();

  startSession(cards: Card[]): void {
    this._activeSession.set({
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      totalCards: cards.length,
      ratings: {},
    });
  }

  rateCard(card: Card, rating: ConfidenceRating): Observable<Card> {
    this._activeSession.update(s => {
      if (!s) return s;
      return { ...s, ratings: { ...s.ratings, [card.id]: rating } };
    });

    const existingSrs: SRSStateData = card.srsState ?? {
      id: crypto.randomUUID(),
      cardId: card.id,
      userId: card.userId,
      algorithm: 'sm2',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
      lastRating: null,
      lastReviewedAt: null,
      nextDueAt: new Date().toISOString(),
      masteryLevel: 0,
      state: 'new',
    };
    const newSrs = this.computeSm2(existingSrs, rating);
    return this.cardApi.update(card.id, { srsState: newSrs, updatedAt: new Date().toISOString() });
  }

  completeSession(): void {
    this._activeSession.set(null);
  }

  private computeSm2(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    let { intervalDays, easeFactor, repetitions } = state;

    if (rating < 3) {
      repetitions = 0;
      intervalDays = rating === 0 ? 1 : 2;
      easeFactor = Math.max(1.3, easeFactor - (rating === 0 ? 0.2 : 0.15));
    } else {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      const easeAdjust = 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02);
      easeFactor = Math.max(1.3, easeFactor + easeAdjust);
    }

    const masteryLevel = Math.min(5, Math.floor(repetitions / 2)) as MasteryLevel;
    const nextDueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
    const srsStateVal = repetitions === 0 ? 'new'
      : masteryLevel >= 4 ? 'mastered'
      : repetitions <= 2 ? 'learning' : 'review';

    return {
      ...state,
      intervalDays,
      easeFactor,
      repetitions,
      lastRating: rating,
      lastReviewedAt: new Date().toISOString(),
      nextDueAt,
      masteryLevel,
      state: srsStateVal as SRSStateData['state'],
    };
  }
}
