import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  PodcastEpisodeActivity, PodcastEpisodeCompletion, PodcastEpisodePreparation,
  PodcastLibraryTopic, PodcastTopicDetail,
} from '@lingua-card/shared/domain';
import { EMPTY, catchError, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
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
    hasSuggestedVocabularyToAdd: computed(() => preparation()?.vocabulary.some(
      item => item.importance === 'essential' && !item.isInVault,
    ) ?? false),
  })),
  withMethods((store, api = inject(PodcastApiService), localData = inject(LocalDataService), auth = inject(AuthService)) => ({
    loadTopics(): void {
      void (async () => {
        const userId = auth.currentUser()?.id;
        const cached = userId ? await localData.getPodcastLibrary(userId) : null;
        if (cached) patchState(store, { ...cached, status: 'success', error: null });
        else patchState(store, { status: 'loading', error: null });
        try {
          const response = await firstValueFrom(api.listTopics());
          patchState(store, { ...response, status: 'success', error: null });
          if (userId) await localData.setPodcastLibrary(userId, response);
        } catch {
          if (!cached) patchState(store, { status: 'error', error: 'Could not load podcasts.' });
        }
      })();
    },
    loadTopic(topicId: string): void {
      void (async () => {
        const cached = await localData.getPodcastTopic(topicId);
        if (cached) patchState(store, { topic: cached, status: 'success', error: null });
        else patchState(store, { topic: null, status: 'loading', error: null });
        try {
          const topic = await firstValueFrom(api.getTopic(topicId));
          patchState(store, { topic, status: 'success', error: null });
          await localData.setPodcastTopic(topic);
        } catch {
          if (!cached) patchState(store, { status: 'error', error: 'Could not load this podcast topic.' });
        }
      })();
    },
    loadPreparation(episodeId: string): void {
      void (async () => {
        const userId = auth.currentUser()?.id;
        const cached = userId ? await localData.getPodcastPreparation(userId, episodeId) : null;
        if (cached) patchState(store, {
          preparation: cached, preparationCollectionId: cached.preparationCollectionId,
          status: 'success', error: null,
        });
        else patchState(store, {
          preparation: null, preparationCollectionId: null, status: 'loading', error: null,
        });
        try {
          const preparation = await firstValueFrom(api.getPreparation(episodeId));
          patchState(store, {
            preparation, preparationCollectionId: preparation.preparationCollectionId,
            status: 'success', error: null,
          });
          if (userId) await localData.setPodcastPreparation(userId, preparation);
        } catch {
          if (!cached) patchState(store, { status: 'error', error: 'Could not prepare this episode.' });
        }
      })();
    },
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
        const preparation = store.preparation();
        const updatedPreparation = preparation
          ? { ...preparation, preparationCollectionId: result.collectionId }
          : null;
        patchState(store, {
          preparation: updatedPreparation,
          preparationCollectionId: result.collectionId, preparationMutationStatus: 'success',
        });
        const userId = auth.currentUser()?.id;
        if (userId && updatedPreparation) {
          await localData.setPodcastPreparation(userId, updatedPreparation);
        }
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
