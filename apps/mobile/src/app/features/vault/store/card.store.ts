import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Card } from '@lingua-card/shared/domain';
import { CardApiService } from '../services/card-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { AuthService } from '../../../core/services/auth.service';

export interface CardFilter {
  categoryId: string | null;
  collectionId: string | null;
  search: string;
}

interface CardState {
  cards: Card[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasEverLoaded: boolean;
  error: string | null;
  selectedCardId: string | null;
  filter: CardFilter;
}

const initialState: CardState = {
  cards: [],
  isLoading: false,
  isRefreshing: false,
  hasEverLoaded: false,
  error: null,
  selectedCardId: null,
  filter: { categoryId: null, collectionId: null, search: '' },
};

export const CardStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ cards, selectedCardId, filter }) => ({
    filteredCards: computed(() => {
      const all = cards();
      const { categoryId, collectionId, search } = filter();
      return all
        .filter((c) => !collectionId || c.collectionId === collectionId)
        .filter((c) => !categoryId || c.categoryIds.includes(categoryId))
        .filter((c) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            c.content.front.toLowerCase().includes(q) ||
            c.content.back.toLowerCase().includes(q)
          );
        });
    }),

    selectedCard: computed(() => {
      const id = selectedCardId();
      return id ? (cards().find((c) => c.id === id) ?? null) : null;
    }),

    dueCards: computed(() => {
      const now = new Date();
      return cards().filter(
        (c) => c.srsState && (c.srsState.masteryLevel ?? 0) > 0 && new Date(c.srsState.nextDueAt) <= now
      );
    }),

    recentCards: computed(() =>
      [...cards()]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5)
    ),

    totalCount: computed(() => cards().length),
    masteredCount: computed(() =>
      cards().filter((c) => (c.srsState?.masteryLevel ?? 0) === 5).length
    ),
    learningCount: computed(() =>
      cards().filter(
        (c) =>
          c.srsState?.state === 'learning' || c.srsState?.state === 'review'
      ).length
    ),
    newCount: computed(() =>
      cards().filter((c) => (c.srsState?.masteryLevel ?? 0) === 0).length
    ),
  })),

  withMethods((store) => {
    const cardApi = inject(CardApiService);
    const localData = inject(LocalDataService);
    const syncService = inject(SyncService);
    const authService = inject(AuthService);

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    return {
      /** Cache-first: show cached data immediately, then refresh from API silently. */
      loadCards(): void {
        void (async () => {
          const userId = uid();

          // 1. Show cache immediately
          if (userId) {
            const cached = await localData.getCards(userId);
            if (cached.length > 0) {
              patchState(store, { cards: cached, hasEverLoaded: true });
            }
          }

          // 2. Block with skeleton only if truly nothing to show
          if (!store.hasEverLoaded()) {
            patchState(store, { isLoading: true, error: null });
          } else {
            patchState(store, { isRefreshing: true });
          }

          try {
            const cards = await firstValueFrom(cardApi.getAll());
            patchState(store, { cards, isLoading: false, isRefreshing: false, hasEverLoaded: true });
            if (userId) await localData.setCards(userId, cards);
          } catch {
            patchState(store, { isLoading: false, isRefreshing: false });
          }
        })();
      },

      /**
       * Optimistic create: adds card to store immediately.
       * Resolves to the server card when online, or temp card when offline.
       */
      createCard(dto: Omit<Card, 'id'>): Observable<Card> {
        const tempId = `temp_${crypto.randomUUID()}`;
        const tempCard: Card = { ...dto, id: tempId };

        patchState(store, { cards: [...store.cards(), tempCard] });

        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'CREATE_CARD', payload: dto });
          const userId = uid();
          if (userId) void localData.setCards(userId, store.cards());
          return of(tempCard);
        }

        return cardApi.create(dto).pipe(
          tap((serverCard) => {
            patchState(store, {
              cards: store.cards().map((c) =>
                c.id === tempId ? serverCard : c
              ),
            });
            const userId = uid();
            if (userId) void localData.setCards(userId, store.cards());
          }),
          catchError(() => {
            void syncService.enqueue({ type: 'CREATE_CARD', payload: dto });
            const userId = uid();
            if (userId) void localData.setCards(userId, store.cards());
            return of(tempCard);
          })
        );
      },

      selectCard(id: string | null): void {
        patchState(store, { selectedCardId: id });
      },

      setSearch(search: string): void {
        patchState(store, { filter: { ...store.filter(), search } });
      },

      setCategoryFilter(categoryId: string | null): void {
        patchState(store, { filter: { ...store.filter(), categoryId } });
      },

      setCollectionFilter(collectionId: string | null): void {
        patchState(store, { filter: { ...store.filter(), collectionId } });
      },

      clearFilter(): void {
        patchState(store, {
          filter: { categoryId: null, collectionId: null, search: '' },
        });
      },

      updateCard(updated: Card): void {
        patchState(store, {
          cards: store.cards().map(c => c.id === updated.id ? updated : c),
        });
        const userId = uid();
        if (userId) void localData.setCards(userId, store.cards());
      },

      setCardsFromSync(cards: Card[]): void {
        patchState(store, { cards });
      },

      reset(): void {
        patchState(store, {
          cards: [],
          isLoading: false,
          error: null,
          selectedCardId: null,
          filter: { categoryId: null, collectionId: null, search: '' },
        });
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCards();
    },
  })
);
