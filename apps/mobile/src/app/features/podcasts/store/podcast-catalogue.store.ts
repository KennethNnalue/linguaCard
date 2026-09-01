import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  PodcastEpisodeActivity, PodcastEpisodeCompletion, PodcastEpisodePreparation,
  PodcastLibraryTopic, PodcastTopicDetail,
} from '@lingua-card/shared/domain';
import { EMPTY, catchError, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { PodcastApiService } from '../data-access/podcast-api.service';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface PodcastCatalogueState {
  topics: PodcastLibraryTopic[];
  continueListening: PodcastEpisodeActivity | null;
  recentEpisodes: PodcastEpisodeActivity[];
  topic: PodcastTopicDetail | null;
  preparation: PodcastEpisodePreparation | null;
  completion: PodcastEpisodeCompletion | null;
  status: LoadState;
  error: string | null;
  preparationCollectionId: string | null;
  preparationMutationStatus: LoadState;
}

const initialState: PodcastCatalogueState = {
  topics: [], continueListening: null, recentEpisodes: [], topic: null,
  preparation: null, completion: null, status: 'idle', error: null,
  preparationCollectionId: null, preparationMutationStatus: 'idle',
};

export const PodcastCatalogueStore = signalStore(
  withState(initialState),
  withComputed(({ status, preparation }) => ({
    isLoading: computed(() => status() === 'loading'),
    essentialVocabulary: computed(() => preparation()?.vocabulary.filter(
      item => item.importance === 'essential',
    ) ?? []),
    supportingVocabulary: computed(() => preparation()?.vocabulary.filter(
      item => item.importance === 'supporting',
    ) ?? []),
  })),
  withMethods((store, api = inject(PodcastApiService)) => ({
    loadTopics: rxMethod<void>(pipe(
      tap(() => patchState(store, { status: 'loading', error: null })),
      switchMap(() => api.listTopics().pipe(
        tap(response => patchState(store, { ...response, status: 'success' })),
        catchError(() => {
          patchState(store, { status: 'error', error: 'Could not load podcasts.' });
          return EMPTY;
        }),
      )),
    )),
    loadTopic: rxMethod<string>(pipe(
      tap(() => patchState(store, { topic: null, status: 'loading', error: null })),
      switchMap(topicId => api.getTopic(topicId).pipe(
        tap(topic => patchState(store, { topic, status: 'success' })),
        catchError(() => {
          patchState(store, { status: 'error', error: 'Could not load this podcast topic.' });
          return EMPTY;
        }),
      )),
    )),
    loadPreparation: rxMethod<string>(pipe(
      tap(() => patchState(store, {
        preparation: null, preparationCollectionId: null, status: 'loading', error: null,
      })),
      switchMap(episodeId => api.getPreparation(episodeId).pipe(
        tap(preparation => patchState(store, { preparation, status: 'success' })),
        catchError(() => {
          patchState(store, { status: 'error', error: 'Could not prepare this episode.' });
          return EMPTY;
        }),
      )),
    )),
    loadCompletion: rxMethod<string>(pipe(
      tap(() => patchState(store, { completion: null, status: 'loading', error: null })),
      switchMap(episodeId => api.getCompletion(episodeId).pipe(
        tap(completion => patchState(store, { completion, status: 'success' })),
        catchError(() => {
          patchState(store, { status: 'error', error: 'Could not load this episode recap.' });
          return EMPTY;
        }),
      )),
    )),
    async prepareSuggestedVocabulary(episodeId: string): Promise<string | null> {
      if (store.preparationMutationStatus() === 'loading') return null;
      const existingCollectionId = store.preparationCollectionId();
      if (existingCollectionId) return existingCollectionId;
      patchState(store, { preparationMutationStatus: 'loading', error: null });
      try {
        const result = await firstValueFrom(api.prepareVocabulary(episodeId));
        patchState(store, {
          preparationCollectionId: result.collectionId, preparationMutationStatus: 'success',
        });
        return result.collectionId;
      } catch {
        patchState(store, {
          preparationMutationStatus: 'error', error: 'Could not prepare the vocabulary collection.',
        });
        return null;
      }
    },
  })),
);
