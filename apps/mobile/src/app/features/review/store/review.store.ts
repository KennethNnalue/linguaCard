import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { CardApiService } from '../../vault/services/card-api.service';
import { Sm2Service } from '../../../shared/srs/sm2.service';
import { LocalDataService, PendingSrsRating } from '../../../core/services/local-data.service';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';

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
  private readonly localData = inject(LocalDataService);
  private readonly authService = inject(AuthService);
  private readonly syncService = inject(SyncService);

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

    // 1. Optimistic SM-2 state update
    const existingSrs = card.srsState ?? this.sm2.freshState(card.id, card.userId);
    const newSrs = this.sm2.compute(existingSrs, rating);

    // 2. Buffer locally — write to pending list regardless of connectivity
    const sessionId = this._activeSession()?.id ?? crypto.randomUUID();
    const pendingRating: PendingSrsRating = {
      cardId: card.id,
      rating,
      reviewedAt: new Date().toISOString(),
      sessionId,
    };
    void this.bufferRating(pendingRating);

    // 3. If online, flush immediately
    if (navigator.onLine) {
      void this.flushRating(pendingRating);
    }
    // If offline, SrsSyncHandler flushes on reconnect

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

    // Flush any remaining buffered ratings now that the session is complete
    if (navigator.onLine) {
      void this.flushAllPending();
    } else {
      void this.syncService.enqueue({
        type: 'FLUSH_SRS_RATINGS',
        payload: { userId: this.authService.currentUser()?.id },
      });
    }
  }

  clearSession(): void {
    this._completedSession.set(null);
  }

  private async bufferRating(rating: PendingSrsRating): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    const existing = await this.localData.getPendingSrsRatings(userId);
    // Deduplicate: keep latest per cardId
    const filtered = existing.filter(r => r.cardId !== rating.cardId);
    await this.localData.setPendingSrsRatings(userId, [...filtered, rating]);
  }

  private async flushRating(rating: PendingSrsRating): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    try {
      await firstValueFrom(this.cardApi.batchRateSrs([rating]));
      // Remove from buffer on success
      const existing = await this.localData.getPendingSrsRatings(userId);
      await this.localData.setPendingSrsRatings(
        userId,
        existing.filter(r => !(r.cardId === rating.cardId && r.reviewedAt === rating.reviewedAt))
      );
    } catch {
      // Will be retried by SrsSyncHandler on reconnect — no action needed
    }
  }

  private async flushAllPending(): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    const pending = await this.localData.getPendingSrsRatings(userId);
    if (pending.length === 0) return;
    try {
      await firstValueFrom(this.cardApi.batchRateSrs(pending));
      await this.localData.setPendingSrsRatings(userId, []);
    } catch {
      void this.syncService.enqueue({ type: 'FLUSH_SRS_RATINGS', payload: { userId } });
    }
  }
}
