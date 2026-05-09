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
import { catchError, EMPTY, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { Collection, CreateCollectionDto, UpdateCollectionDto } from '../../../core/models/mock-data';
import { CollectionApiService } from '../../../core/services/collection-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AuthService } from '../../../core/services/auth.service';

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
      return id ? (collections().find((c) => c.id === id) ?? null) : null;
    }),

    totalDue: computed(() =>
      collections().reduce((sum, c) => sum + (c.dueCount ?? 0), 0)
    ),

    totalCards: computed(() =>
      collections().reduce((sum, c) => sum + (c.cardCount ?? 0), 0)
    ),
  })),

  withMethods((store) => {
    const api = inject(CollectionApiService);
    const localData = inject(LocalDataService);
    const authService = inject(AuthService);

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    return {
      /** Seed the store instantly from local storage before API responds. */
      hydrate(collections: Collection[]): void {
        patchState(store, { collections });
      },

      /** Offline-first: show cached data immediately, then refresh from API. */
      loadCollections(): void {
        void (async () => {
          patchState(store, { isLoading: true, error: null });

          const userId = uid();
          if (userId) {
            const cached = await localData.getCollections(userId);
            if (cached.length > 0) {
              patchState(store, { collections: cached });
            }
          }

          try {
            const collections = await firstValueFrom(api.getAll());
            patchState(store, { collections, isLoading: false });
            if (userId) await localData.setCollections(userId, collections);
          } catch {
            patchState(store, { isLoading: false });
          }
        })();
      },

      setActiveCollection(id: string | null): void {
        patchState(store, { activeCollectionId: id });
      },

      createCollection: rxMethod<CreateCollectionDto>(
        pipe(
          switchMap((dto) =>
            api.create(dto).pipe(
              tap(async (col) => {
                const next = [...store.collections(), col];
                patchState(store, { collections: next });
                const userId = uid();
                if (userId) await localData.setCollections(userId, next);
              }),
              catchError(() => EMPTY)
            )
          )
        )
      ),

      updateCollection: rxMethod<{ id: string; dto: UpdateCollectionDto }>(
        pipe(
          switchMap(({ id, dto }) =>
            api.update(id, dto).pipe(
              tap(async (updated) => {
                const next = store
                  .collections()
                  .map((c) => (c.id === id ? updated : c));
                patchState(store, { collections: next });
                const userId = uid();
                if (userId) await localData.setCollections(userId, next);
              }),
              catchError(() => EMPTY)
            )
          )
        )
      ),

      deleteCollection: rxMethod<string>(
        pipe(
          switchMap((id) =>
            api.remove(id).pipe(
              tap(async () => {
                const next = store.collections().filter((c) => c.id !== id);
                patchState(store, { collections: next });
                const userId = uid();
                if (userId) await localData.setCollections(userId, next);
              }),
              catchError(() => EMPTY)
            )
          )
        )
      ),

      reset(): void {
        patchState(store, {
          collections: [],
          isLoading: false,
          activeCollectionId: null,
          error: null,
        });
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCollections();
    },
  })
);
