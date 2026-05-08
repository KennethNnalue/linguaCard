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
import { Collection, CreateCollectionDto, UpdateCollectionDto } from '../../../core/models/mock-data';
import { CollectionApiService } from '../../../core/services/collection-api.service';

interface CollectionState {
  collections: Collection[];
  isLoading: boolean;
  activeCollectionId: string | null;
  error: string | null;
}

const initialState: CollectionState = {
  collections: [],
  isLoading: false,
  activeCollectionId: null,
  error: null,
};

export const CollectionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ collections, activeCollectionId }) => ({
    activeCollection: computed(() => {
      const id = activeCollectionId();
      return id ? (collections().find(c => c.id === id) ?? null) : null;
    }),

    totalDue: computed(() =>
      collections().reduce((sum, c) => sum + (c.dueCount ?? 0), 0),
    ),

    totalCards: computed(() =>
      collections().reduce((sum, c) => sum + (c.cardCount ?? 0), 0),
    ),
  })),

  withMethods(store => {
    const api = inject(CollectionApiService);

    return {
      loadCollections: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            api.getAll().pipe(
              tap(collections => patchState(store, { collections, isLoading: false })),
              catchError(err => {
                patchState(store, {
                  error: err?.message ?? 'Failed to load collections',
                  isLoading: false,
                });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      setActiveCollection(id: string | null): void {
        patchState(store, { activeCollectionId: id });
      },

      createCollection: rxMethod<CreateCollectionDto>(
        pipe(
          switchMap(dto =>
            api.create(dto).pipe(
              tap(col => patchState(store, { collections: [...store.collections(), col] })),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),

      updateCollection: rxMethod<{ id: string; dto: UpdateCollectionDto }>(
        pipe(
          switchMap(({ id, dto }) =>
            api.update(id, dto).pipe(
              tap(updated =>
                patchState(store, {
                  collections: store.collections().map(c => (c.id === id ? updated : c)),
                }),
              ),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),

      deleteCollection: rxMethod<string>(
        pipe(
          switchMap(id =>
            api.remove(id).pipe(
              tap(() =>
                patchState(store, {
                  collections: store.collections().filter(c => c.id !== id),
                }),
              ),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCollections();
    },
  }),
);
