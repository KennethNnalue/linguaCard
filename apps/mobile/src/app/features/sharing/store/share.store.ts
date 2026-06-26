import { computed, inject } from '@angular/core';
import {
  patchState, signalStore, withComputed, withHooks, withMethods, withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, EMPTY } from 'rxjs';
import type { ShareNotification, ShareRecord } from '@lingua-card/shared/domain';
import { ShareApiService } from '../services/share-api.service';
import { AuthService } from '../../../core/services/auth.service';

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

// How often to poll for newly received shares while the app is foregrounded.
const POLL_INTERVAL_MS = 45_000;

export const ShareStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ pendingCount }) => ({
    hasPending: computed(() => pendingCount() > 0),
  })),

  withMethods((store) => {
    const api = inject(ShareApiService);
    const auth = inject(AuthService);
    let autoRefreshStarted = false;

    const refreshCount = rxMethod<void>(
      pipe(
        switchMap(() => api.getPendingCount().pipe(
          tap(({ count }) => patchState(store, { pendingCount: count })),
          catchError(() => EMPTY),
        )),
      ),
    );

    return {
      refreshCount,

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

      loadSent: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true })),
          switchMap(() => api.getSentShares().pipe(
            tap(shares => patchState(store, { sentShares: shares, isLoading: false })),
            catchError(() => { patchState(store, { isLoading: false }); return EMPTY; }),
          )),
        ),
      ),

      /**
       * Keeps the pending-share badge live without the user having to relaunch
       * the app: polls while foregrounded and re-checks whenever the tab/app
       * returns to the foreground. Idempotent — safe to call more than once.
       */
      startAutoRefresh(): void {
        if (autoRefreshStarted) return;
        autoRefreshStarted = true;

        const canPoll = () => navigator.onLine && !document.hidden && auth.isAuthenticated();

        refreshCount();

        setInterval(() => {
          if (canPoll()) refreshCount();
        }, POLL_INTERVAL_MS);

        document.addEventListener('visibilitychange', () => {
          if (canPoll()) refreshCount();
        });
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.refreshCount();
    },
  }),
);
