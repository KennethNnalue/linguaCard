import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type { PodcastEpisodePlayer } from '@lingua-card/shared/domain';
import { EMPTY, catchError, concatMap, firstValueFrom, pipe, tap } from 'rxjs';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { findPodcastTurnAtTime } from '../domain/podcast-playback';
import {
  type PodcastRepeatMode, resolvePodcastPlaybackTarget,
} from '../domain/podcast-playback-queue';
import {
  appendQualifyingPlaybackRange, type PodcastPlaybackRange,
} from '../domain/podcast-listening-progress';

export type PodcastTranslationMode = 'target' | 'both' | 'reveal';

interface PodcastPlayerState {
  episode: PodcastEpisodePlayer | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  currentTimeMs: number;
  lastPlaybackTimeMs: number;
  unsyncedPlayedRanges: readonly PodcastPlaybackRange[];
  isPlaying: boolean;
  speed: number;
  repeatMode: PodcastRepeatMode;
  topicQueueEnabled: boolean;
  continueToNextTopic: boolean;
  translationMode: PodcastTranslationMode;
  revealedTurnId: string | null;
  progressError: string | null;
  playbackQueue: string[];
}

const initialState: PodcastPlayerState = {
  episode: null, status: 'idle', error: null, currentTimeMs: 0,
  lastPlaybackTimeMs: 0, unsyncedPlayedRanges: [],
  isPlaying: false, speed: 1, repeatMode: 'off', topicQueueEnabled: false,
  continueToNextTopic: false, translationMode: 'both', revealedTurnId: null,
  progressError: null,
  playbackQueue: [],
};

export const PodcastPlayerStore = signalStore(
  withState(initialState),
  withComputed(({ episode, currentTimeMs }) => ({
    currentTurn: computed(() => findPodcastTurnAtTime(episode()?.turns ?? [], currentTimeMs())),
    progressPercent: computed(() => {
      const duration = episode()?.audioDurationMs ?? 0;
      return duration ? Math.min(100, currentTimeMs() / duration * 100) : 0;
    }),
  })),
  withComputed(({ currentTurn, currentTimeMs, translationMode, revealedTurnId }) => ({
    activeWordIndex: computed(() => currentTurn()?.wordTimings.findIndex(
      word => currentTimeMs() >= word.startMs && currentTimeMs() < word.endMs,
    ) ?? -1),
    showTranslation: computed(() => translationMode() === 'both'
      || (translationMode() === 'reveal' && revealedTurnId() === currentTurn()?.id)),
  })),
  withMethods((
    store,
    api = inject(PodcastApiService),
    localData = inject(LocalDataService),
    auth = inject(AuthService),
    audioCache = inject(AiAudioCacheService),
    engagement = inject(EngagementStore),
  ) => ({
    loadEpisode(episodeId: string): void {
      void (async () => {
        patchState(store, {
          episode: null, currentTimeMs: 0, lastPlaybackTimeMs: 0, unsyncedPlayedRanges: [],
          isPlaying: false, revealedTurnId: null,
          progressError: null, status: 'loading', error: null,
        });
        const userId = auth.currentUser()?.id;
        const cached = userId ? await localData.getPodcastPlayer(userId, episodeId) : null;
        const present = async (episode: PodcastEpisodePlayer): Promise<void> => {
          const audioUrl = await audioCache.getOrDownload(
            `podcast-${episode.id}-v${episode.audioVersion}`,
            episode.audioUrl,
          );
          patchState(store, {
            episode: { ...episode, audioUrl: audioUrl ?? episode.audioUrl },
            currentTimeMs: episode.progress?.completedAt ? 0 : episode.progress?.positionMs ?? 0,
            lastPlaybackTimeMs: episode.progress?.completedAt ? 0 : episode.progress?.positionMs ?? 0,
            status: 'success', error: null,
          });
        };
        if (cached) await present(cached);
        try {
          const episode = await firstValueFrom(api.getPlayer(episodeId));
          if (userId) await localData.setPodcastPlayer(userId, episode);
          await present(episode);
        } catch {
          if (!cached) patchState(store, { status: 'error', error: 'Could not load this podcast episode.' });
        }
      })();
    },
    playbackTimeChanged(currentTimeMs: number): void {
      const playedRanges = appendQualifyingPlaybackRange(
        store.unsyncedPlayedRanges(), store.lastPlaybackTimeMs(), currentTimeMs, store.isPlaying(),
      );
      patchState(store, {
        currentTimeMs,
        lastPlaybackTimeMs: currentTimeMs,
        unsyncedPlayedRanges: playedRanges,
      });
    },
    playbackStateChanged(isPlaying: boolean): void { patchState(store, { isPlaying }); },
    speedChanged(speed: number): void { patchState(store, { speed }); },
    playbackScopeChanged(topicQueueEnabled: boolean): void {
      patchState(store, {
        topicQueueEnabled,
        repeatMode: topicQueueEnabled ? store.repeatMode() : 'off',
        continueToNextTopic: topicQueueEnabled && store.continueToNextTopic(),
      });
    },
    playbackQueueChanged(playbackQueue: readonly string[]): void {
      patchState(store, { playbackQueue: [...playbackQueue] });
    },
    repeatModeChanged(repeatMode: PodcastRepeatMode): void { patchState(store, { repeatMode }); },
    continueToNextTopicChanged(continueToNextTopic: boolean): void {
      patchState(store, { continueToNextTopic });
    },
    translationModeChanged(translationMode: PodcastTranslationMode): void {
      patchState(store, { translationMode, revealedTurnId: null });
    },
    revealTranslation(): void { patchState(store, { revealedTurnId: store.currentTurn()?.id ?? null }); },
    persistProgress: rxMethod<boolean>(pipe(
      concatMap(completed => {
        const episode = store.episode();
        if (!episode) return EMPTY;
        const playedRanges = store.unsyncedPlayedRanges();
        patchState(store, { unsyncedPlayedRanges: [] });
        return api.saveProgress(episode.id, {
          audioVersion: episode.audioVersion,
          positionMs: store.currentTimeMs(),
          completed,
          playedRanges,
        }).pipe(
          tap(() => patchState(store, { progressError: null })),
          catchError(() => {
            patchState(store, {
              progressError: 'Listening progress could not be saved.',
              unsyncedPlayedRanges: [...playedRanges, ...store.unsyncedPlayedRanges()],
            });
            return EMPTY;
          }),
        );
      }),
    )),
    async completeCurrentEpisode(): Promise<number | null> {
      const episode = store.episode();
      if (!episode) return null;
      try {
        const playedRanges = store.unsyncedPlayedRanges();
        const progress = await firstValueFrom(api.saveProgress(episode.id, {
          audioVersion: episode.audioVersion,
          positionMs: episode.audioDurationMs,
          completed: true,
          playedRanges,
        }));
        if (!progress.completedAt) {
          patchState(store, {
            progressError: 'Listen to at least 70% of the episode before completing it.',
            isPlaying: false,
            unsyncedPlayedRanges: [],
          });
          return null;
        }
        patchState(store, { progressError: null, isPlaying: false, unsyncedPlayedRanges: [] });
        await engagement.refreshFromServer();
        return progress.pointsAwarded;
      } catch {
        patchState(store, { progressError: 'Listening progress could not be saved.' });
        return null;
      }
    },
    nextPlaybackTarget(): string | null {
      const episode = store.episode();
      if (!episode) return null;
      return resolvePodcastPlaybackTarget(episode, {
        repeatMode: store.repeatMode(), topicQueueEnabled: store.topicQueueEnabled(),
        continueToNextTopic: store.continueToNextTopic(),
        playbackQueue: store.playbackQueue(),
      });
    },
  })),
);
