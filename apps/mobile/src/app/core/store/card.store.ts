import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { Card } from '../models/mock-data';
import { CardApiService } from '../services/card-api.service';

export interface CardFilter {
  categoryId: string | null;
  collectionId: string | null;
  search: string;
}

interface CardState {
  cards: Card[];
  isLoading: boolean;
  error: string | null;
  selectedCardId: string | null;
  filter: CardFilter;
}

const initialState: CardState = {
  cards: [],
  isLoading: false,
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
        .filter(c => !collectionId || c.collectionId === collectionId)
        .filter(c => !categoryId || c.categoryIds.includes(categoryId))
        .filter(c => {
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
      return id ? (cards().find(c => c.id === id) ?? null) : null;
    }),

    dueCards: computed(() => {
      const now = new Date();
      return cards().filter(
        c => c.srsState && new Date(c.srsState.nextDueAt) <= now,
      );
    }),

    recentCards: computed(() =>
      [...cards()]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    ),

    totalCount: computed(() => cards().length),

    masteredCount: computed(() =>
      cards().filter(c => c.srsState?.state === 'mastered').length,
    ),

    learningCount: computed(() =>
      cards().filter(
        c =>
          c.srsState?.state === 'learning' || c.srsState?.state === 'review',
      ).length,
    ),

    newCount: computed(() =>
      cards().filter(c => c.srsState?.state === 'new').length,
    ),
  })),

  withMethods(store => {
    const cardApi = inject(CardApiService);

    return {
      loadCards: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            cardApi.getAll().pipe(
              tap(cards => patchState(store, { cards, isLoading: false })),
              catchError(err => {
                patchState(store, {
                  error: err?.message ?? 'Failed to load cards',
                  isLoading: false,
                });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

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
        patchState(store, { filter: { categoryId: null, collectionId: null, search: '' } });
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCards();
    },
  }),
);
