import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { catchError, firstValueFrom, Observable, of, tap } from 'rxjs';
import { Collection, CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/domain';
import { CollectionApiService } from '../services/collection-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { AuthService } from '../../../core/services/auth.service';

interface CollectionState {
  collections: Collection[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasEverLoaded: boolean;
  activeCollectionId: string | null;
  error: string | null;
}

const initialState: CollectionState = {
  collections: [],
  isLoading: false,
  isRefreshing: false,
  hasEverLoaded: false,
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
    const syncService = inject(SyncService);
    const authService = inject(AuthService);

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    return {
      /** Cache-first: show cached data immediately, then refresh from API silently. */
      loadCollections(): void {
        void (async () => {
          const userId = uid();

          // 1. Show cache immediately
          if (userId) {
            const cached = await localData.getCollections(userId);
            if (cached.length > 0) {
              patchState(store, { collections: cached, hasEverLoaded: true });
            }
          }

          // 2. Block with skeleton only if nothing to show
          if (!store.hasEverLoaded()) {
            patchState(store, { isLoading: true, error: null });
          } else {
            patchState(store, { isRefreshing: true });
          }

          try {
            const collections = await firstValueFrom(api.getAll());
            patchState(store, { collections, isLoading: false, isRefreshing: false, hasEverLoaded: true });
            if (userId) await localData.setCollections(userId, collections);
          } catch {
            patchState(store, { isLoading: false, isRefreshing: false });
          }
        })();
      },

      setActiveCollection(id: string | null): void {
        patchState(store, { activeCollectionId: id });
      },

      createCollection(dto: CreateCollectionDto): Observable<Collection> {
        const tempId = `temp_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const tempCol: Collection = {
          id: tempId,
          userId: uid() ?? '',
          name: dto.name,
          description: dto.description ?? '',
          emoji: dto.emoji ?? '📚',
          colour: dto.colour ?? '#2D5A4E',
          contextId: dto.contextId,
          cardCount: 0,
          masteredCount: 0,
          dueCount: 0,
          isDefault: false,
          importStatus: 'complete',
          pendingWords: [],
          createdAt: now,
          updatedAt: now,
        };
        patchState(store, { collections: [...store.collections(), tempCol] });

        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'CREATE_COLLECTION', payload: dto });
          const userId = uid();
          if (userId) void localData.setCollections(userId, store.collections());
          return of(tempCol);
        }

        return api.create(dto).pipe(
          tap(async (col) => {
            patchState(store, {
              collections: store.collections().map((c) => (c.id === tempId ? col : c)),
            });
            const userId = uid();
            if (userId) await localData.setCollections(userId, store.collections());
          }),
          catchError(() => {
            void syncService.enqueue({ type: 'CREATE_COLLECTION', payload: dto });
            const userId = uid();
            if (userId) void localData.setCollections(userId, store.collections());
            return of(tempCol);
          })
        );
      },

      updateCollection(id: string, dto: UpdateCollectionDto): Observable<Collection> {
        const optimistic = store
          .collections()
          .map((c) => (c.id === id ? { ...c, ...dto, updatedAt: new Date().toISOString() } : c));
        const optimisticCol = optimistic.find((c) => c.id === id)!;
        patchState(store, { collections: optimistic });

        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'UPDATE_COLLECTION', payload: { id, dto } });
          const userId = uid();
          if (userId) void localData.setCollections(userId, store.collections());
          return of(optimisticCol);
        }

        return api.update(id, dto).pipe(
          tap(async (updated) => {
            patchState(store, {
              collections: store.collections().map((c) => (c.id === id ? updated : c)),
            });
            const userId = uid();
            if (userId) await localData.setCollections(userId, store.collections());
          }),
          catchError(() => {
            void syncService.enqueue({ type: 'UPDATE_COLLECTION', payload: { id, dto } });
            const userId = uid();
            if (userId) void localData.setCollections(userId, store.collections());
            return of(optimisticCol);
          })
        );
      },

      deleteCollection(id: string): Observable<void> {
        patchState(store, { collections: store.collections().filter((c) => c.id !== id) });

        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'DELETE_COLLECTION', payload: id });
          const userId = uid();
          if (userId) void localData.setCollections(userId, store.collections());
          return of(undefined as void);
        }

        return api.remove(id).pipe(
          tap(async () => {
            const userId = uid();
            if (userId) await localData.setCollections(userId, store.collections());
          }),
          catchError(() => {
            void syncService.enqueue({ type: 'DELETE_COLLECTION', payload: id });
            const userId = uid();
            if (userId) void localData.setCollections(userId, store.collections());
            return of(undefined as void);
          })
        );
      },

      setCollectionsFromSync(collections: Collection[]): void {
        patchState(store, { collections });
      },

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
