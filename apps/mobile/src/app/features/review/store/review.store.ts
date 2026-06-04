import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { CardApiService } from '../../vault/services/card-api.service';
import { CardStore } from '../../vault/store/card.store';
import { Sm2Service } from '../../../shared/srs/sm2.service';
import { LocalDataService, PendingSrsRating } from '../../../core/services/local-data.service';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';
import { LocalReviewSession, MAX_SESSION_HISTORY, SyncOperationType } from '../models/review.model';

export type ReviewSession = LocalReviewSession;

// Disk format — stores card IDs instead of full Card objects
interface PersistedSession extends Omit<ReviewSession, 'reviewedCards' | 'completedAt'> {
  reviewedCardIds: string[];
  completedAt: string | null;
}

interface ReviewState {
  activeSession: ReviewSession | null;
  completedSession: ReviewSession | null;
  sessionHistory: ReviewSession[];
  pendingQueue: Card[];
}

const initialState: ReviewState = {
  activeSession: null,
  completedSession: null,
  sessionHistory: [],
  pendingQueue: [],
};

export const ReviewStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(store => {
    const cardApi = inject(CardApiService);
    const cardStore = inject(CardStore);
    const sm2 = inject(Sm2Service);
    const localData = inject(LocalDataService);
    const authService = inject(AuthService);
    const syncService = inject(SyncService);

    // Serialises all IndexedDB rating writes to prevent read-modify-write races
    // when multiple rateCard() calls fire before any write resolves.
    let bufferChain: Promise<void> = Promise.resolve();

    async function persistHistory(sessions: ReviewSession[]): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      const slim: PersistedSession[] = sessions.map(({ reviewedCards, ...rest }) => ({
        ...rest,
        reviewedCardIds: reviewedCards.map(c => c.id),
      }));
      await localData.setSessionHistory(userId, slim);
    }

    async function bufferRating(rating: PendingSrsRating): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      const existing = await localData.getPendingSrsRatings(userId);
      // Replace any prior rating for the same card in this session (re-rate scenario)
      const filtered = existing.filter(r => r.cardId !== rating.cardId);
      await localData.setPendingSrsRatings(userId, [...filtered, rating]);
    }

    async function flushRating(rating: PendingSrsRating): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      try {
        await firstValueFrom(cardApi.batchRateSrs([rating]));
        const existing = await localData.getPendingSrsRatings(userId);
        await localData.setPendingSrsRatings(
          userId,
          existing.filter(r => !(r.cardId === rating.cardId && r.reviewedAt === rating.reviewedAt)),
        );
      } catch {
        // Will be retried by SrsSyncHandler on reconnect
      }
    }

    async function flushAllPending(): Promise<void> {
      const userId = authService.currentUser()?.id;
      if (!userId) return;
      const pending = await localData.getPendingSrsRatings(userId);
      if (pending.length === 0) return;
      try {
        await firstValueFrom(cardApi.batchRateSrs(pending));
        await localData.setPendingSrsRatings(userId, []);
      } catch {
        void syncService.enqueue({ type: SyncOperationType.FLUSH_SRS_RATINGS, payload: { userId } });
      }
    }

    return {
      async loadHistory(): Promise<void> {
        const userId = authService.currentUser()?.id;
        if (!userId) return;
        const stored = (await localData.getSessionHistory(userId)) as PersistedSession[];
        if (!stored?.length) return;

        // Prefer the live store if already populated; fall back to the local cache
        // so we don't race against CardStore.loadCards() which is also async.
        let allCards = cardStore.cards();
        if (allCards.length === 0) {
          allCards = await localData.getCards(userId);
        }
        const cardById = new Map(allCards.map(c => [c.id, c]));

        const sessions: ReviewSession[] = stored.map(s => ({
          ...s,
          completedAt: s.completedAt ?? null,
          reviewedCards: (s.reviewedCardIds ?? [])
            .map(id => cardById.get(id))
            .filter((c): c is Card => c !== undefined),
        }));

        patchState(store, { sessionHistory: sessions });
      },

      startSession(cards: Card[], collectionId: string | null, collectionName: string | null): void {
        patchState(store, {
          completedSession: null,
          pendingQueue: cards,
          activeSession: {
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            completedAt: null,
            totalCards: cards.length,
            ratings: {},
            collectionId,
            collectionName,
            reviewedCards: [],
          },
        });
      },

      rateCard(card: Card, rating: ConfidenceRating): void {
        const active = store.activeSession();
        if (active) {
          patchState(store, {
            activeSession: { ...active, ratings: { ...active.ratings, [card.id]: rating } },
          });
        }

        // 1. Compute new SRS state and apply optimistically to the store immediately
        const existingSrs = card.srsState ?? sm2.freshState(card.id, card.userId);
        const newSrs = sm2.compute(existingSrs, rating);
        cardStore.updateCard({ ...card, srsState: newSrs });

        // 2. Buffer locally — serialise writes to avoid read-modify-write race
        // Use the session ID captured before state update; fall back to a fresh UUID.
        const sessionId = active?.id ?? crypto.randomUUID();
        const pendingRating: PendingSrsRating = {
          cardId: card.id,
          rating,
          reviewedAt: new Date().toISOString(),
          sessionId,
        };
        bufferChain = bufferChain.then(() => bufferRating(pendingRating));

        // 3. If online, flush this single rating immediately after it has been buffered.
        // batchRateSrs is the single authoritative write path — no separate PATCH needed.
        if (navigator.onLine) {
          bufferChain = bufferChain.then(() => flushRating(pendingRating));
        }
      },

      completeSession(finalQueue: Card[]): void {
        const active = store.activeSession();
        if (!active) return;
        const completed: ReviewSession = {
          ...active,
          completedAt: new Date().toISOString(),
          reviewedCards: finalQueue,
        };

        const updated = [completed, ...store.sessionHistory()].slice(0, MAX_SESSION_HISTORY);
        patchState(store, {
          completedSession: completed,
          activeSession: null,
          pendingQueue: [],
          sessionHistory: updated,
        });
        void persistHistory(updated);

        // Wait for any in-flight per-card buffer/flush, then flush the rest
        bufferChain = bufferChain.then(() => {
          if (navigator.onLine) return flushAllPending();
          void syncService.enqueue({
            type: SyncOperationType.FLUSH_SRS_RATINGS,
            payload: { userId: authService.currentUser()?.id },
          });
          return Promise.resolve();
        });
      },

      clearSession(): void {
        patchState(store, { completedSession: null });
      },

      clearPendingQueue(): void {
        patchState(store, { pendingQueue: [] });
      },
    };
  }),
);

