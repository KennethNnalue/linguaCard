import {computed, inject} from '@angular/core';
import {patchState, signalStore, withComputed, withMethods, withState} from '@ngrx/signals';
import {rxMethod} from '@ngrx/signals/rxjs-interop';
import type {AdminCollectionAudioPreparationResult} from '@lingua-card/shared/domain';
import {catchError, EMPTY, exhaustMap, filter, switchMap, take, tap, timer} from 'rxjs';
import {AdminApiService} from '../services/admin-api.service';

interface AdminCollectionAudioState {
  activeCollectionId: string | null;
  status: AdminCollectionAudioPreparationResult | null;
  error: string | null;
  starting: boolean;
}

const initialState: AdminCollectionAudioState = {
  activeCollectionId: null,
  status: null,
  error: null,
  starting: false,
};

export const AdminCollectionAudioStore = signalStore(
  {providedIn: 'root'},
  withState(initialState),
  withComputed(({activeCollectionId, starting, status}) => ({
    isPreparing: computed(() => starting() || status()?.running === true),
    isPreparingCollection: computed(() => (id: string) =>
      activeCollectionId() === id && (starting() || status()?.running === true)),
    isReadyCollection: computed(() => (id: string) =>
      activeCollectionId() === id && status()?.status === 'ready_to_publish'),
  })),
  withMethods(store => {
    const api = inject(AdminApiService);
    return {
      prepare: rxMethod<string>(
        exhaustMap(collectionId => {
          patchState(store, {activeCollectionId: collectionId, status: null, error: null, starting: true});
          return api.startCollectionAudioPreparation(collectionId).pipe(
            tap(start => patchState(store, {status: start, starting: false})),
            switchMap(start => start.started
              ? timer(750, 1500).pipe(
                switchMap(() => api.getCollectionAudioStatus(collectionId)),
                tap(status => patchState(store, {status})),
                filter(status => !status.running),
                take(1),
              )
              : [start]),
            catchError(() => {
              patchState(store, {
                activeCollectionId: collectionId,
                error: 'Audio preparation failed. You can retry without importing the collection again.',
                starting: false,
              });
              return EMPTY;
            }),
          );
        }),
      ),
      clear(): void {
        patchState(store, initialState);
      },
    };
  }),
);
