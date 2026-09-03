import { computed, effect, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { CardView, VaultView } from '@lingua-card/shared/domain';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import type { CachedVaultSnapshot } from '../../../core/services/local-data.service';
import { type ListLearningItemsRequest, VaultV2ApiService } from '../data-access/vault-v2-api.service';
import { VaultV2DataService } from '../services/vault-v2-data.service';

type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; origin: 'cache' | 'api' }
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
  withMethods(store => {
    const api = inject(VaultV2ApiService);
    const data = inject(VaultV2DataService);
    let loadSequence = 0;

    function applySnapshot(snapshot: CachedVaultSnapshot, origin: 'cache' | 'api'): void {
      patchState(store, {
        learningContextId: snapshot.learningContextId,
        vaultRequest: { status: 'success', data: snapshot.vault, origin },
        learningItemsRequest: { status: 'success', data: snapshot.learningItems, origin },
        nextLearningItemsCursor: null,
      });
    }

    async function loadActiveVault(): Promise<void> {
      const sequence = ++loadSequence;
      const hasVisibleSnapshot = store.vaultRequest().status === 'success'
        && store.learningItemsRequest().status === 'success';
      if (!hasVisibleSnapshot) {
        patchState(store, {
          vaultRequest: { status: 'loading' },
          learningItemsRequest: { status: 'loading' },
        });
      }

      try {
        const cached = await data.loadCachedSnapshot();
        if (sequence !== loadSequence) return;
        if (cached) applySnapshot(cached, 'cache');
      } catch {
        // A cache read failure must not prevent a network recovery.
      }

      if (!navigator.onLine) {
        if (sequence === loadSequence && store.vaultRequest().status !== 'success') {
          patchState(store, {
            vaultRequest: { status: 'error', message: 'Your Vault is not saved on this device yet' },
            learningItemsRequest: { status: 'error', message: 'Your words are not saved on this device yet' },
          });
        }
        return;
      }

      try {
        const snapshot = await data.refreshSnapshot();
        if (sequence === loadSequence) applySnapshot(snapshot, 'api');
      } catch {
        if (sequence !== loadSequence || store.vaultRequest().status === 'success') return;
        patchState(store, {
          vaultRequest: { status: 'error', message: 'Unable to load your Vault' },
          learningItemsRequest: { status: 'error', message: 'Unable to load words' },
        });
      }
    }

    return {
      loadActiveVault,
      applySnapshotFromSync(snapshot: CachedVaultSnapshot): void {
        applySnapshot(snapshot, 'api');
      },
      ensureActiveVault(): void {
        const vault = store.vaultRequest();
        const items = store.learningItemsRequest();
        if (vault.status === 'success' && items.status === 'success'
          && items.data.length === vault.data.allWords.itemCount) return;
        if (vault.status === 'loading' || items.status === 'loading') return;
        void loadActiveVault();
      },
      loadVault: rxMethod<string>(pipe(
        tap(learningContextId => patchState(store, {
          learningContextId,
          vaultRequest: { status: 'loading' },
          learningItemsRequest: { status: 'idle' },
          nextLearningItemsCursor: null,
        })),
        switchMap(learningContextId => api.loadVault(learningContextId).pipe(
          tap(vault => patchState(store, {
            vaultRequest: { status: 'success', data: vault, origin: 'api' },
          })),
          catchError(() => {
            patchState(store, { vaultRequest: { status: 'error', message: 'Unable to load your Vault' } });
            return EMPTY;
          }),
        )),
      )),
      loadLearningItems: rxMethod<ListLearningItemsRequest>(pipe(
        tap(request => patchState(store, {
          learningContextId: request.learningContextId,
          learningItemsRequest: { status: 'loading' },
          nextLearningItemsCursor: null,
        })),
        switchMap(request => api.listLearningItems(request).pipe(
          tap(page => patchState(store, {
            learningItemsRequest: { status: 'success', data: page.items, origin: 'api' },
            nextLearningItemsCursor: page.nextCursor,
          })),
          catchError(() => {
            patchState(store, { learningItemsRequest: { status: 'error', message: 'Unable to load words' } });
            return EMPTY;
          }),
        )),
      )),
      reset(): void {
        loadSequence += 1;
        patchState(store, initialState);
      },
    };
  }),
  withHooks(store => {
    const auth = inject(AuthService);
    let activeUserId = auth.currentUser()?.id;
    return {
      onInit(): void {
        effect(() => {
          const nextUserId = auth.currentUser()?.id;
          if (nextUserId === activeUserId) return;
          activeUserId = nextUserId;
          store.reset();
          if (nextUserId) void store.loadActiveVault();
        });
      },
    };
  }),
);
