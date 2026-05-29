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
import { Category } from '@lingua-card/shared/domain';
import { CategoryApiService } from '../services/category-api.service';

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
}

const initialState: CategoryState = {
  categories: [],
  isLoading: false,
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

    return {
      loadCategories: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            api.getAll().pipe(
              tap(categories => patchState(store, { categories, isLoading: false })),
              catchError(err => {
                patchState(store, {
                  error: err?.message ?? 'Failed to load categories',
                  isLoading: false,
                });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      createCategory: rxMethod<{ name: string; colour?: string }>(
        pipe(
          switchMap(dto =>
            api.create(dto).pipe(
              tap(cat => patchState(store, { categories: [...store.categories(), cat] })),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
    };
  }),

  withHooks({
    onInit(store) {
      store.loadCategories();
    },
  }),
);
