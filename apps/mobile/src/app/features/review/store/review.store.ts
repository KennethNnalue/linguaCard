import {inject, Injectable, signal} from '@angular/core';
import {firstValueFrom, Observable} from 'rxjs';
import {Card, ConfidenceRating} from '@lingua-card/shared/domain';
import {CardApiService} from '../../vault/services/card-api.service';
import {Sm2Service} from '../../../shared/srs/sm2.service';
import {LocalDataService, PendingSrsRating} from '../../../core/services/local-data.service';
import {AuthService} from '../../../core/services/auth.service';
import {SyncService} from '../../../core/services/sync.service';

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

// Keep at most this many sessions in local storage to avoid unbounded growth
const MAX_HISTORY = 50;

@Injectable({providedIn: 'root'})
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

  // Called once at app startup (from a root-level initializer or the review feature init)
  async loadHistory(): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    const stored = await this.localData.getSessionHistory(userId) as ReviewSession[];
    if (stored?.length) {
      this._sessionHistory.set(stored);
    }
  }

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
      return {...s, ratings: {...s.ratings, [card.id]: rating}};
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

    return this.cardApi.update(card.id, {srsState: newSrs, updatedAt: new Date().toISOString()});
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

    // Prepend to in-memory history and persist to local storage
    this._sessionHistory.update(history => {
      const updated = [completed, ...history].slice(0, MAX_HISTORY);
      void this.persistHistory(updated);
      return updated;
    });

    // Flush any remaining buffered ratings now that the session is complete
    if (navigator.onLine) {
      void this.flushAllPending();
    } else {
      void this.syncService.enqueue({
        type: 'FLUSH_SRS_RATINGS',
        payload: {userId: this.authService.currentUser()?.id},
      });
    }
  }

  clearSession(): void {
    this._completedSession.set(null);
  }

  private async persistHistory(sessions: ReviewSession[]): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    // Strip reviewedCards from each session before persisting to keep storage lean
    // (reviewedCards are large Card objects — not needed for the history list display)
    const slim = sessions.map(({reviewedCards: _, ...rest}) => rest);
    await this.localData.setSessionHistory(userId, slim);
  }

  private async bufferRating(rating: PendingSrsRating): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    const existing = await this.localData.getPendingSrsRatings(userId);
    const filtered = existing.filter(r => r.cardId !== rating.cardId);
    await this.localData.setPendingSrsRatings(userId, [...filtered, rating]);
  }

  private async flushRating(rating: PendingSrsRating): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    try {
      await firstValueFrom(this.cardApi.batchRateSrs([rating]));
      const existing = await this.localData.getPendingSrsRatings(userId);
      await this.localData.setPendingSrsRatings(
        userId,
        existing.filter(r => !(r.cardId === rating.cardId && r.reviewedAt === rating.reviewedAt))
      );
    } catch {
      // Will be retried by SrsSyncHandler on reconnect
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
      void this.syncService.enqueue({type: 'FLUSH_SRS_RATINGS', payload: {userId}});
    }
  }
}
