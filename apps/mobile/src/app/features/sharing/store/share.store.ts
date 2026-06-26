import { computed, inject } from '@angular/core';
import {
  patchState, signalStore, withComputed, withHooks, withMethods, withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, EMPTY } from 'rxjs';
import type { ShareNotification, ShareRecord } from '@lingua-card/shared/domain';
import { ShareApiService } from '../services/share-api.service';

interface ShareState {
  pendingShares: ShareNotification[];
  sentShares: ShareRecord[];
  pendingCount: number;
  isLoading: boolean;
}

const initialState: ShareState = {
  pendingShares: [],
  sentShares: [],
  pendingCount: 0,
  isLoading: false,
};

export const ShareStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ pendingCount }) => ({
    hasPending: computed(() => pendingCount() > 0),
  })),

  withMethods((store) => {
    const api = inject(ShareApiService);

    return {
      loadPending: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true })),
          switchMap(() => api.getPendingShares().pipe(
            tap(result => patchState(store, {
              pendingShares: result.pending,
              pendingCount: result.total,
              isLoading: false,
            })),
            catchError(() => { patchState(store, { isLoading: false }); return EMPTY; }),
          )),
        ),
      ),

      refreshCount: rxMethod<void>(
        pipe(
          switchMap(() => api.getPendingCount().pipe(
            tap(({ count }) => patchState(store, { pendingCount: count })),
            catchError(() => EMPTY),
          )),
        ),
      ),

      loadSent: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true })),
          switchMap(() => api.getSentShares().pipe(
            tap(shares => patchState(store, { sentShares: shares, isLoading: false })),
            catchError(() => { patchState(store, { isLoading: false }); return EMPTY; }),
          )),
        ),
      ),

      acceptShare: rxMethod<string>(
        pipe(
          switchMap(id => api.respondToShare(id, { accept: true }).pipe(
            tap(() => {
              patchState(store, {
                pendingShares: store.pendingShares().filter(s => s.id !== id),
                pendingCount: Math.max(0, store.pendingCount() - 1),
              });
            }),
            catchError(() => EMPTY),
          )),
        ),
      ),

      rejectShare: rxMethod<string>(
        pipe(
          switchMap(id => api.respondToShare(id, { accept: false }).pipe(
            tap(() => {
              patchState(store, {
                pendingShares: store.pendingShares().filter(s => s.id !== id),
                pendingCount: Math.max(0, store.pendingCount() - 1),
              });
            }),
            catchError(() => EMPTY),
          )),
        ),
      ),
    };
  }),

  withHooks({
    onInit(store) {
      store.refreshCount();
    },
  }),
);
