import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  AdminPlatformCollectionImportPayload,
  AdminPlatformCollectionImportPreview,
  AdminPlatformCollectionImportResult,
  AdminPlatformCollectionImportStatus,
} from '@lingua-card/shared/domain';
import { catchError, EMPTY, exhaustMap, filter, map, pipe, switchMap, take, tap, timer } from 'rxjs';
import { PlatformCollectionImportApiService } from '../data-access/platform-collection-import-api.service';

type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

interface PlatformCollectionImportState {
  payload: AdminPlatformCollectionImportPayload | null;
  validation: RequestState<AdminPlatformCollectionImportPreview>;
  importRequest: RequestState<AdminPlatformCollectionImportResult>;
  progress: AdminPlatformCollectionImportStatus | null;
}

const initialState: PlatformCollectionImportState = {
  payload: null,
  validation: { status: 'idle' },
  importRequest: { status: 'idle' },
  progress: null,
};

export const PlatformCollectionImportStore = signalStore(
  withState(initialState),
  withComputed(({ validation, importRequest, progress }) => ({
    preview: computed(() => {
      const request = validation();
      return request.status === 'success' ? request.data : null;
    }),
    validationError: computed(() => {
      const request = validation();
      return request.status === 'error' ? request.message : null;
    }),
    importError: computed(() => {
      const request = importRequest();
      return request.status === 'error' ? request.message : null;
    }),
    isValidating: computed(() => validation().status === 'loading'),
    isImporting: computed(() => importRequest().status === 'loading'),
    progress: computed(() => progress()),
    imported: computed(() => {
      const request = importRequest();
      return request.status === 'success' ? request.data : null;
    }),
  })),
  withMethods((store) => {
    const api = inject(PlatformCollectionImportApiService);
    return {
      validate: rxMethod<AdminPlatformCollectionImportPayload>(
        pipe(
          tap(payload => patchState(store, {
            payload,
            validation: { status: 'loading' },
            importRequest: { status: 'idle' },
          })),
          switchMap(payload => api.validate(payload).pipe(
            tap(preview => patchState(store, { validation: { status: 'success', data: preview } })),
            catchError(() => {
              patchState(store, { validation: { status: 'error', message: 'This file is not a valid V2 collection.' } });
              return EMPTY;
            }),
          )),
        ),
      ),
      importDraft: rxMethod<void>(
        pipe(
          exhaustMap(() => {
            const payload = store.payload();
            const validation = store.validation();
            if (!payload || validation.status !== 'success' || validation.data.status !== 'valid') return EMPTY;
            patchState(store, { importRequest: { status: 'loading' } });
            return api.importDraft({ fingerprint: validation.data.fingerprint, payload }).pipe(
              switchMap(result => result.status === 'processing'
                ? timer(0, 750).pipe(
                  switchMap(() => api.status(result.importId)),
                  tap(status => patchState(store, { progress: status })),
                  filter(status => status.status !== 'processing'),
                  take(1),
                  map(status => {
                    if (status.status === 'failed' || !status.collectionId) {
                      throw new Error(status.error ?? 'Import failed');
                    }
                    return {
                      importId: status.importId,
                      collectionId: status.collectionId,
                      title: status.title,
                      status: status.status,
                      inserted: status.inserted,
                      reused: status.reused,
                      audioLinked: status.audioLinked,
                    } as AdminPlatformCollectionImportResult;
                  }),
                )
                : [result]),
              tap(result => patchState(store, { importRequest: { status: 'success', data: result } })),
              catchError(() => {
                patchState(store, { importRequest: { status: 'error', message: 'The draft could not be imported.' } });
                return EMPTY;
              }),
            );
          }),
        ),
      ),
      retryAudio: rxMethod<string>(
        pipe(
          tap(() => patchState(store, { importRequest: { status: 'loading' } })),
          exhaustMap(importId => api.retry(importId).pipe(
            tap(result => patchState(store, { importRequest: { status: 'success', data: result } })),
            catchError(() => {
              patchState(store, { importRequest: { status: 'error', message: 'Audio retry did not complete.' } });
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
