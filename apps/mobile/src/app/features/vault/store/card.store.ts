import { computed, effect, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { catchError, firstValueFrom, Observable, of, tap } from 'rxjs';
import { Card, ScheduledCard } from '@lingua-card/shared/domain';
import { generateUuid } from '@lingua-card/shared/utils';
import { CardApiService } from '../services/card-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { AuthService } from '../../../core/services/auth.service';
import { isDue, isMastered, isNew, isStruggling } from '../../review/domain/review-status';
import { createNewSchedulingState } from '../../review/domain/review-domain';
import { overlayLocalSchedulingStates, serializeSchedulingState } from '../../review/domain/review-persistence';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';

export interface CardFilter {
  categoryId: string | null;
  collectionId: string | null;
  search: string;
}

interface CardState {
  cards: ScheduledCard[];
  loadState: CardLoadState;
  selectedCardId: string | null;
  filter: CardFilter;
}

export type CardLoadState =
  | { status: 'idle' }
  | { status: 'loading'; mode: 'initial' | 'refreshing' }
  | {
      status: 'ready';
      origin: 'cache' | 'api';
      isEmpty: boolean;
      warnings: readonly CardLoadFailure[];
    }
  | { status: 'error'; failures: readonly CardLoadFailure[]; hasCachedCards: boolean };

export interface CardLoadFailure {
  phase: 'cache_read' | 'api' | 'cache_write';
  message: string;
}

const initialState: CardState = {
  cards: [],
  loadState: { status: 'idle' },
  selectedCardId: null,
  filter: { categoryId: null, collectionId: null, search: '' },
};

export const CardStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ cards, loadState, selectedCardId, filter }) => ({
    isLoading: computed(() => {
      const state = loadState();
      return state.status === 'loading' && state.mode === 'initial';
    }),
    isRefreshing: computed(() => {
      const state = loadState();
      return state.status === 'loading' && state.mode === 'refreshing';
    }),
    isReady: computed(() => loadState().status === 'ready'),
    loadError: computed(() => loadState().status === 'error' ? loadState() : null),
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
      return cards().filter(c => isDue(c, now));
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
    masteredCount: computed(() => cards().filter(isMastered).length),
    learningCount: computed(() =>
      cards().filter(c => c.reviewState.stage !== 'new' && c.reviewState.stage !== 'mastered').length
    ),
    newCount: computed(() => cards().filter(isNew).length),
    // "reviews" = studied cards that are due today
    reviewCount: computed(() => { const now = new Date(); return cards().filter(c => isDue(c, now)).length; }),
    strugglingCount: computed(() => cards().filter(isStruggling).length),
  })),

  withMethods((store) => {
    const cardApi = inject(CardApiService);
    const localData = inject(LocalDataService);
    const syncService = inject(SyncService);
    const authService = inject(AuthService);
    const reviewLocal = inject(ReviewLocalRepository);
    let loadSequence = 0;

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    function currentLoadState(): CardLoadState {
      return store.loadState();
    }

    return {
      async loadCards(): Promise<CardLoadState> {
        const sequence = ++loadSequence;
        const userId = uid();
        const failures: CardLoadFailure[] = [];
        const isCurrent = (): boolean => sequence === loadSequence && userId === uid();
        const hasVisibleCards = store.cards().length > 0;
        patchState(store, { loadState: { status: 'loading', mode: hasVisibleCards ? 'refreshing' : 'initial' } });

        if (userId) {
          try {
            const cached = overlayLocalSchedulingStates(
              await localData.getCards(userId),
              await reviewLocal.schedulingStates(userId),
            );
            if (!isCurrent()) return currentLoadState();
            if (cached.length > 0) {
              patchState(store, { cards: cached });
            }
          } catch {
            if (!isCurrent()) return currentLoadState();
            failures.push({ phase: 'cache_read', message: 'Unable to read cards saved on this device.' });
          }
        }

        if (!navigator.onLine && store.cards().length > 0) {
          const ready: CardLoadState = {
            status: 'ready',
            origin: 'cache',
            isEmpty: false,
            warnings: failures,
          };
          patchState(store, { loadState: ready });
          return ready;
        }

        patchState(store, { loadState: { status: 'loading', mode: store.cards().length > 0 ? 'refreshing' : 'initial' } });

        let cards: ScheduledCard[];
        try {
          const serverCards = await firstValueFrom(cardApi.getAll());
          cards = userId
            ? overlayLocalSchedulingStates(serverCards, await reviewLocal.schedulingStates(userId))
            : serverCards;
        } catch {
          if (!isCurrent()) return currentLoadState();
          failures.push({ phase: 'api', message: 'Unable to refresh cards from the server.' });
          if (store.cards().length > 0) {
            const ready: CardLoadState = {
              status: 'ready',
              origin: 'cache',
              isEmpty: false,
              warnings: failures,
            };
            patchState(store, { loadState: ready });
            return ready;
          }
          const failed: CardLoadState = {
            status: 'error',
            failures,
            hasCachedCards: store.cards().length > 0,
          };
          patchState(store, { loadState: failed });
          return failed;
        }

        if (!isCurrent()) return currentLoadState();
        patchState(store, { cards });
        if (userId) {
          try {
            await localData.setCards(userId, cards);
          } catch {
            if (!isCurrent()) return currentLoadState();
            failures.push({ phase: 'cache_write', message: 'Unable to save refreshed cards on this device.' });
          }
        }

        if (!isCurrent()) return currentLoadState();
        const ready: CardLoadState = {
          status: 'ready',
          origin: 'api',
          isEmpty: cards.length === 0,
          warnings: failures,
        };
        patchState(store, { loadState: ready });
        return ready;
      },

      /**
       * Optimistic create: adds card to store immediately.
       * Resolves to the server card when online, or temp card when offline.
       */
      createCard(dto: Omit<Card, 'id'>): Observable<ScheduledCard> {
        const tempId = `temp_${generateUuid()}`;
        const tempCard: ScheduledCard = {
          ...dto,
          id: tempId,
          reviewState: serializeSchedulingState(createNewSchedulingState(tempId)),
        };

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

      updateCard(updated: ScheduledCard): void {
        patchState(store, {
          cards: store.cards().map(c => c.id === updated.id ? updated : c),
        });
        const userId = uid();
        if (userId) void localData.setCards(userId, store.cards());
      },

      setCardsFromSync(cards: ScheduledCard[]): void {
        patchState(store, { cards });
      },

      reset(): void {
        loadSequence += 1;
        patchState(store, {
          cards: [],
          loadState: { status: 'idle' },
          selectedCardId: null,
          filter: { categoryId: null, collectionId: null, search: '' },
        });
      },
    };
  }),

  withHooks((store) => {
    const authService = inject(AuthService);
    let activeUserId = authService.currentUser()?.id;

    return {
      onInit() {
        effect(() => {
          const nextUserId = authService.currentUser()?.id;
          if (nextUserId === activeUserId) return;
          activeUserId = nextUserId;
          store.reset();
          if (nextUserId) void store.loadCards();
        });
        if (activeUserId) void store.loadCards();
      },
    };
  })
);
