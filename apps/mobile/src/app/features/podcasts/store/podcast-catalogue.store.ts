import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  CefrLevel, OnboardingLevel, PodcastEpisodeActivity, PodcastEpisodeCompletion, PodcastEpisodePlayer, PodcastEpisodePreparation,
  PodcastLibraryFeaturedEpisode, PodcastLibraryLevel, PodcastLibraryResponse, PodcastLibraryTopic, PodcastTopicDetail,
} from '@lingua-card/shared/domain';
import { EMPTY, catchError, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { SettingsStore } from '../../settings/store/settings.store';

const levelStorageKey = 'lc_podcast_level';
const onboardingLevel: Record<OnboardingLevel, CefrLevel> = {
  beginner: 'A1', some: 'A2', intermediate: 'B1',
};

function storedPodcastLevel(): PodcastLibraryLevel | null {
  try {
    for (const key of [levelStorageKey, 'lc_explore_level']) {
      const level = localStorage.getItem(key);
      if (level === 'all' || level === 'A1' || level === 'A2' || level === 'B1' || level === 'B2') return level;
    }
    return null;
  } catch { return null; }
}

export interface PodcastFeaturedEpisode {
  episode: PodcastLibraryFeaturedEpisode;
  source: 'continue' | 'suggested' | 'recent';
  progressPercent: number | null;
  completed: boolean;
}

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface PodcastCatalogueState {
  topics: PodcastLibraryTopic[];
  continueListening: PodcastEpisodeActivity | null;
  recentEpisodes: PodcastEpisodeActivity[];
  suggestedEpisodes: PodcastLibraryFeaturedEpisode[];
  selectedLevel: PodcastLibraryLevel;
  topic: PodcastTopicDetail | null;
  preparation: PodcastEpisodePreparation | null;
  transcriptEpisode: PodcastEpisodePlayer | null;
  transcriptStatus: LoadState;
  completion: PodcastEpisodeCompletion | null;
  status: LoadState;
  error: string | null;
  preparationCollectionId: string | null;
  preparationMutationStatus: LoadState;
}

const initialState: PodcastCatalogueState = {
  topics: [], continueListening: null, recentEpisodes: [], suggestedEpisodes: [], selectedLevel: 'A1', topic: null,
  preparation: null, transcriptEpisode: null, transcriptStatus: 'idle',
  completion: null, status: 'idle', error: null,
  preparationCollectionId: null, preparationMutationStatus: 'idle',
};

export const PodcastCatalogueStore = signalStore(
  withState(initialState),
  withComputed(({ status, preparation, continueListening, suggestedEpisodes, recentEpisodes, selectedLevel }) => ({
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
    resumableEpisodes: computed(() => recentEpisodes().filter(item => item.status === 'in_progress')),
    completedEpisodes: computed(() => recentEpisodes().filter(item => item.status === 'completed')),
    discoveryEpisodes: computed(() => suggestedEpisodes().filter(item => selectedLevel() === 'all' || item.level === selectedLevel())),
    featuredEpisodes: computed(() => {
      const items: PodcastFeaturedEpisode[] = [];
      const seen = new Set<string>();
      const current = continueListening();
      const recent = recentEpisodes().length ? recentEpisodes() : current ? [current] : [];
      for (const activity of recent) {
        if (seen.has(activity.episode.id) || items.length >= 3) continue;
        items.push({
          episode: activity.episode, source: 'recent', progressPercent: activity.progressPercent,
          completed: activity.status === 'completed',
        });
        seen.add(activity.episode.id);
      }
      for (const episode of suggestedEpisodes()) {
        if (seen.has(episode.id) || items.length >= 10 || (selectedLevel() !== 'all' && episode.level !== selectedLevel())) continue;
        items.push({ episode, source: 'suggested', progressPercent: null, completed: false });
        seen.add(episode.id);
      }
      return items;
    }),
  })),
  withMethods((store, api = inject(PodcastApiService), localData = inject(LocalDataService), auth = inject(AuthService), settings = inject(SettingsStore)) => {
    let libraryRequest = 0;
    let levelInitialized = false;
    function loadForLevel(level: PodcastLibraryLevel): void {
      const request = ++libraryRequest;
      patchState(store, { selectedLevel: level });
      void (async () => {
        const userId = auth.currentUser()?.id;
        let cached: PodcastLibraryResponse | null = null;
        try { if (userId) cached = await localData.getPodcastLibrary(userId, level); } catch { /* Continue online without the cache. */ }
        if (request !== libraryRequest) return;
        if (cached) patchState(store, { ...cached, status: 'success', error: null });
        else patchState(store, { status: 'loading', error: null });
        try {
          const response = await firstValueFrom(api.listTopics(level));
          if (request !== libraryRequest) return;
          patchState(store, { ...response, status: 'success', error: null });
          try { if (userId) await localData.setPodcastLibrary(userId, level, response); } catch { /* Keep the network result. */ }
        } catch {
          if (request === libraryRequest && !cached) patchState(store, { status: 'error', error: 'Could not load podcasts.' });
        }
      })();
    }
    return {
    loadTopics(): void {
      if (!levelInitialized) {
        levelInitialized = true;
        const userLevel = settings.settings()?.level;
        loadForLevel(storedPodcastLevel() ?? (userLevel ? onboardingLevel[userLevel] : 'A1'));
      } else loadForLevel(store.selectedLevel());
    },
    selectLevel(level: PodcastLibraryLevel): void {
      levelInitialized = true;
      try { localStorage.setItem(levelStorageKey, level); } catch { /* Browser storage may be unavailable. */ }
      loadForLevel(level);
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
    loadTranscript(episodeId: string): void {
      if (store.transcriptEpisode()?.id === episodeId || store.transcriptStatus() === 'loading') return;
      patchState(store, { transcriptEpisode: null, transcriptStatus: 'loading' });
      void (async () => {
        const userId = auth.currentUser()?.id;
        let cached: PodcastEpisodePlayer | null = null;
        try { if (userId) cached = await localData.getPodcastPlayer(userId, episodeId); } catch { /* Try the API. */ }
        if (cached) patchState(store, { transcriptEpisode: cached, transcriptStatus: 'success' });
        try {
          const episode = await firstValueFrom(api.getPlayer(episodeId));
          patchState(store, { transcriptEpisode: episode, transcriptStatus: 'success' });
          if (userId) await localData.setPodcastPlayer(userId, episode);
        } catch {
          if (!cached) patchState(store, { transcriptStatus: 'error' });
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
  }; }),
);
