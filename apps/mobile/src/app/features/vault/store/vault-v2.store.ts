import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { CardView, VaultView } from '@lingua-card/shared/domain';
import { catchError, EMPTY, expand, forkJoin, pipe, reduce, switchMap, tap } from 'rxjs';
import {
  type ListLearningItemsRequest,
  VaultV2ApiService,
} from '../data-access/vault-v2-api.service';

type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

interface VaultV2State {
  learningContextId: string | null;
  vaultRequest: RequestState<VaultView>;
  learningItemsRequest: RequestState<readonly CardView[]>;
  nextLearningItemsCursor: string | null;
}

const initialState: VaultV2State = {
  learningContextId: null,
  vaultRequest: { status: 'idle' },
  learningItemsRequest: { status: 'idle' },
  nextLearningItemsCursor: null,
};

export const VaultV2Store = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ vaultRequest, learningItemsRequest }) => ({
    vault: computed(() => {
      const request = vaultRequest();
      return request.status === 'success' ? request.data : null;
    }),
    learningItems: computed(() => {
      const request = learningItemsRequest();
      return request.status === 'success' ? request.data : [];
    }),
    isVaultLoading: computed(() => vaultRequest().status === 'loading'),
    isLearningItemsLoading: computed(() => learningItemsRequest().status === 'loading'),
    hasCompleteVault: computed(() => {
      const vault = vaultRequest();
      const items = learningItemsRequest();
      return vault.status === 'success'
        && items.status === 'success'
        && items.data.length === vault.data.allWords.itemCount;
    }),
  })),
  withMethods((store) => {
    const api = inject(VaultV2ApiService);

    const loadActiveVault = rxMethod<void>(
      pipe(
        tap(() => {
          if (store.vaultRequest().status !== 'success') {
            patchState(store, { vaultRequest: { status: 'loading' } });
          }
          if (store.learningItemsRequest().status !== 'success') {
            patchState(store, { learningItemsRequest: { status: 'loading' } });
          }
        }),
        switchMap(() => api.loadActiveContext()),
        switchMap(context => forkJoin({
          vault: api.loadVault(context.id),
          items: api.listLearningItems({ learningContextId: context.id, limit: 100 }).pipe(
            expand(page => page.nextCursor
              ? api.listLearningItems({ learningContextId: context.id, cursor: page.nextCursor, limit: 100 })
              : EMPTY),
            reduce((items, page) => [...items, ...page.items], [] as CardView[]),
          ),
        }).pipe(
          tap(({ vault, items }) => patchState(store, {
            learningContextId: context.id,
            vaultRequest: { status: 'success', data: vault },
            learningItemsRequest: { status: 'success', data: items },
            nextLearningItemsCursor: null,
          })),
          catchError(() => {
            if (store.vaultRequest().status !== 'success') {
              patchState(store, { vaultRequest: { status: 'error', message: 'Unable to load your Vault' } });
            }
            if (store.learningItemsRequest().status !== 'success') {
              patchState(store, { learningItemsRequest: { status: 'error', message: 'Unable to load words' } });
            }
            return EMPTY;
          }),
        )),
      ),
    );

    return {
      loadActiveVault,

      ensureActiveVault(): void {
        const vault = store.vaultRequest();
        const items = store.learningItemsRequest();
        if (vault.status === 'success'
          && items.status === 'success'
          && items.data.length === vault.data.allWords.itemCount) return;
        if (store.vaultRequest().status === 'loading'
          || store.learningItemsRequest().status === 'loading') return;
        loadActiveVault();
      },

      loadVault: rxMethod<string>(
        pipe(
          tap(learningContextId => patchState(store, {
            learningContextId,
            vaultRequest: { status: 'loading' },
            learningItemsRequest: { status: 'idle' },
            nextLearningItemsCursor: null,
          })),
          switchMap(learningContextId => api.loadVault(learningContextId).pipe(
            tap(vault => patchState(store, {
              vaultRequest: { status: 'success', data: vault },
            })),
            catchError(() => {
              patchState(store, {
                vaultRequest: { status: 'error', message: 'Unable to load your Vault' },
              });
              return EMPTY;
            }),
          )),
        ),
      ),

      loadLearningItems: rxMethod<ListLearningItemsRequest>(
        pipe(
          tap(request => patchState(store, {
            learningContextId: request.learningContextId,
            learningItemsRequest: { status: 'loading' },
            nextLearningItemsCursor: null,
          })),
          switchMap(request => api.listLearningItems(request).pipe(
            tap(page => patchState(store, {
              learningItemsRequest: { status: 'success', data: page.items },
              nextLearningItemsCursor: page.nextCursor,
            })),
            catchError(() => {
              patchState(store, {
                learningItemsRequest: { status: 'error', message: 'Unable to load words' },
              });
              return EMPTY;
            }),
          )),
        ),
      ),

      reset(): void {
        patchState(store, initialState);
      },
    };
  }),
);
