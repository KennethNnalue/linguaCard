import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Category } from '@lingua-card/shared/domain';
import { CategoryApiService } from '../services/category-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AuthService } from '../../../core/services/auth.service';

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  hasEverLoaded: boolean;
  error: string | null;
}

const initialState: CategoryState = {
  categories: [],
  isLoading: false,
  hasEverLoaded: false,
  error: null,
};

export const CategoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ categories }) => ({
    categoryMap: computed(() =>
      new Map(categories().map(c => [c.id, c]))
    ),
  })),

  withMethods(store => {
    const api = inject(CategoryApiService);
    const localData = inject(LocalDataService);
    const authService = inject(AuthService);

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    return {
      /**
       * Cache-first: serve cached categories immediately, then refresh from
       * the API silently — but only when online. Fully offline-capable.
       */
      loadCategories(): void {
        void (async () => {
          const userId = uid();

          // 1. Show cache immediately
          if (userId) {
            const cached = await localData.getCategories(userId);
            if (cached.length > 0) {
              patchState(store, { categories: cached, hasEverLoaded: true });
            }
          }

          // 2. Offline with cached data — nothing more to do
          if (!navigator.onLine && store.hasEverLoaded()) {
            return;
          }

          // 3. Skip if data was fetched recently (TTL: 5 minutes)
          const lastSynced = await localData.getLastSyncedAt('categories');
          if (lastSynced && store.hasEverLoaded() && Date.now() - new Date(lastSynced).getTime() < 5 * 60 * 1000) {
            return;
          }

          // 4. Show skeleton only if truly nothing to show yet
          if (!store.hasEverLoaded()) {
            patchState(store, { isLoading: true, error: null });
          }

          try {
            const categories = await firstValueFrom(api.getAll());
            patchState(store, { categories, isLoading: false, hasEverLoaded: true });
            if (userId) {
              await localData.setCategories(userId, categories);
              await localData.setLastSyncedAt('categories', new Date().toISOString());
            }
          } catch (err: unknown) {
            patchState(store, {
              error: err instanceof Error ? err.message : 'Failed to load categories',
              isLoading: false,
            });
          }
        })();
      },

      createCategory(dto: { name: string; colour?: string }): void {
        void (async () => {
          try {
            const cat = await firstValueFrom(api.create(dto));
            const updated = [...store.categories(), cat];
            patchState(store, { categories: updated });
            const userId = uid();
            if (userId) await localData.setCategories(userId, updated);
          } catch {
            // Silently ignore — category creation is best-effort
          }
        })();
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCategories();
    },
  }),
);
