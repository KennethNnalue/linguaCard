import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  AdminCreatePodcastEpisodeDto,
  AdminCreatePodcastTopicDto,
  AdminPodcastTopicListItem,
  AdminPodcastTranscriptPayload,
  AdminPodcastTranscriptPreview,
} from '@lingua-card/shared/domain';
import { EMPTY, catchError, exhaustMap, pipe, switchMap, tap } from 'rxjs';
import {
  AdminPodcastApiService, PodcastThumbnailUpload,
} from '../data-access/admin-podcast-api.service';
import { adminPodcastErrorMessage } from './admin-podcast-error';

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

interface AdminPodcastState {
  topics: AdminPodcastTopicListItem[];
  loadStatus: RequestStatus;
  mutationStatus: RequestStatus;
  error: string | null;
  success: string | null;
  transcriptEpisodeId: string | null;
  transcriptPayload: AdminPodcastTranscriptPayload | null;
  transcriptPreview: AdminPodcastTranscriptPreview | null;
  transcriptStatus: RequestStatus;
  audioGenerationEpisodeId: string | null;
  audioGenerationStatus: RequestStatus;
}

const initialState: AdminPodcastState = {
  topics: [],
  loadStatus: 'idle',
  mutationStatus: 'idle',
  error: null,
  success: null,
  transcriptEpisodeId: null,
  transcriptPayload: null,
  transcriptPreview: null,
  transcriptStatus: 'idle',
  audioGenerationEpisodeId: null,
  audioGenerationStatus: 'idle',
};

export interface CreateEpisodeCommand {
  topicId: string;
  dto: AdminCreatePodcastEpisodeDto;
}

export interface UploadTopicThumbnailCommand {
  topicId: string;
  upload: PodcastThumbnailUpload;
}

export interface UploadEpisodeThumbnailCommand {
  episodeId: string;
  upload: PodcastThumbnailUpload;
}

export interface PreviewTranscriptCommand {
  episodeId: string;
  payload: AdminPodcastTranscriptPayload;
}

export const AdminPodcastStore = signalStore(
  withState(initialState),
  withComputed(({ topics, loadStatus, mutationStatus }) => ({
    isLoading: computed(() => loadStatus() === 'loading'),
    isMutating: computed(() => mutationStatus() === 'loading'),
    draftTopicCount: computed(() => topics().filter(topic => topic.status === 'draft').length),
    episodeCount: computed(() => topics().reduce(
      (total, topic) => total + topic.episodes.length,
      0,
    )),
  })),
  withMethods((store, api = inject(AdminPodcastApiService)) => ({
    loadTopics: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loadStatus: 'loading', error: null })),
        switchMap(() => api.listTopics().pipe(
          tap(topics => patchState(store, { topics, loadStatus: 'success' })),
          catchError(error => {
            patchState(store, {
              loadStatus: 'error',
              error: adminPodcastErrorMessage(error, 'Could not load podcast topics.'),
            });
            return EMPTY;
          }),
        )),
      ),
    ),
    createTopic: rxMethod<AdminCreatePodcastTopicDto>(
      pipe(
        exhaustMap(dto => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.createTopic(dto).pipe(
            tap(topic => patchState(store, {
              topics: [topic, ...store.topics()],
              mutationStatus: 'success',
              success: `Topic “${topic.title}” was created as a draft. Add its first episode next.`,
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not create the topic.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    createEpisode: rxMethod<CreateEpisodeCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.createEpisode(command.topicId, command.dto).pipe(
            tap(episode => patchState(store, {
              topics: store.topics().map(topic => topic.id === command.topicId
                ? { ...topic, episodes: [...topic.episodes, episode].sort((a, b) => a.position - b.position) }
                : topic),
              mutationStatus: 'success',
              success: `Episode “${episode.title}” was created as a draft. Add its image and transcript next.`,
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not create the episode.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    uploadTopicThumbnail: rxMethod<UploadTopicThumbnailCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.uploadTopicThumbnail(command.topicId, command.upload).pipe(
            tap(thumbnail => patchState(store, {
              topics: store.topics().map(topic => topic.id === command.topicId
                ? { ...topic, thumbnail }
                : topic),
              mutationStatus: 'success',
              success: 'The topic image was saved.',
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not upload the topic thumbnail.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    uploadEpisodeThumbnail: rxMethod<UploadEpisodeThumbnailCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.uploadEpisodeThumbnail(command.episodeId, command.upload).pipe(
            tap(thumbnail => patchState(store, {
              topics: store.topics().map(topic => ({
                ...topic,
                episodes: topic.episodes.map(episode => episode.id === command.episodeId
                  ? { ...episode, thumbnail }
                  : episode),
              })),
              mutationStatus: 'success',
              success: 'The episode image was saved.',
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not upload the episode thumbnail.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    previewTranscript: rxMethod<PreviewTranscriptCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, {
            transcriptEpisodeId: command.episodeId, transcriptPayload: command.payload,
            transcriptPreview: null, transcriptStatus: 'loading', error: null,
            success: null,
          });
          return api.previewTranscript(command.episodeId, command.payload).pipe(
            exhaustMap(preview => {
              patchState(store, { transcriptPreview: preview, transcriptStatus: 'success' });
              if (preview.status === 'conflicts') return EMPTY;
              patchState(store, { transcriptStatus: 'loading' });
              return api.commitTranscript(command.episodeId, preview.fingerprint, command.payload).pipe(
                tap(result => patchState(store, {
                  topics: store.topics().map(topic => ({
                    ...topic,
                    episodes: topic.episodes.map(episode => episode.id === command.episodeId
                      ? {
                        ...episode,
                        title: result.title,
                        titleTranslation: result.titleTranslation,
                        description: result.description,
                        hasTranscript: true,
                        estimatedDurationMs: result.estimatedDurationMs,
                      }
                      : episode),
                  })),
                  transcriptStatus: 'success',
                  transcriptPayload: null,
                  success: `Transcript imported. ${result.vocabularyCount} vocabulary items were prepared automatically.`,
                })),
                catchError(error => {
                  patchState(store, {
                    transcriptStatus: 'error',
                    error: adminPodcastErrorMessage(error, 'Could not import the transcript.'),
                  });
                  return EMPTY;
                }),
              );
            }),
            catchError(error => {
              patchState(store, {
                transcriptStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not validate the transcript file.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    commitTranscript: rxMethod<void>(
      pipe(
        exhaustMap(() => {
          const episodeId = store.transcriptEpisodeId();
          const payload = store.transcriptPayload();
          const preview = store.transcriptPreview();
          if (!episodeId || !payload || !preview || preview.status !== 'valid') return EMPTY;
          patchState(store, { transcriptStatus: 'loading', error: null, success: null });
          return api.commitTranscript(episodeId, preview.fingerprint, payload).pipe(
            tap(result => patchState(store, {
              topics: store.topics().map(topic => ({
                ...topic,
                episodes: topic.episodes.map(episode => episode.id === episodeId
                  ? {
                    ...episode,
                    title: result.title,
                    titleTranslation: result.titleTranslation,
                    description: result.description,
                    hasTranscript: true,
                    estimatedDurationMs: result.estimatedDurationMs,
                  }
                  : episode),
              })),
              transcriptStatus: 'success', transcriptPayload: null, transcriptPreview: null,
              success: 'The transcript was imported successfully. Generate the episode audio next.',
            })),
            catchError(error => {
              patchState(store, {
                transcriptStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not import the transcript.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    generateAudio: rxMethod<string>(
      pipe(
        exhaustMap(episodeId => {
          patchState(store, {
            audioGenerationEpisodeId: episodeId, audioGenerationStatus: 'loading', error: null,
            success: null,
          });
          return api.generateAudio(episodeId).pipe(
            tap(result => patchState(store, {
              topics: store.topics().map(topic => ({
                ...topic,
                episodes: topic.episodes.map(episode => episode.id === episodeId
                  ? {
                    ...episode, status: result.status, audioUrl: result.audioUrl,
                    audioDurationMs: result.audioDurationMs, audioVersion: result.audioVersion,
                    generationError: null,
                  }
                  : episode),
              })),
              audioGenerationStatus: 'success',
              success: 'Audio generation finished. Listen to the result before publishing the episode.',
            })),
            catchError(error => {
              patchState(store, {
                audioGenerationStatus: 'error',
                error: adminPodcastErrorMessage(
                  error,
                  'Podcast audio generation failed. Review the episode and try again.',
                ),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    publishEpisode: rxMethod<string>(
      pipe(
        exhaustMap(episodeId => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.publishEpisode(episodeId).pipe(
            tap(published => patchState(store, {
              topics: store.topics().map(topic => ({
                ...topic,
                episodes: topic.episodes.map(episode => episode.id === episodeId ? published : episode),
              })),
              mutationStatus: 'success',
              success: `Episode “${published.title}” is now published.`,
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not publish the episode.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    publishTopic: rxMethod<string>(
      pipe(
        exhaustMap(topicId => {
          const topic = store.topics().find(item => item.id === topicId);
          if (!topic) {
            patchState(store, {
              mutationStatus: 'error', error: 'This podcast topic is no longer available.', success: null,
            });
            return EMPTY;
          }
          if (!topic.thumbnail) {
            patchState(store, {
              mutationStatus: 'error', error: 'Upload the topic image before publishing.', success: null,
            });
            return EMPTY;
          }
          if (!topic.episodes.some(episode => episode.status === 'published')) {
            patchState(store, {
              mutationStatus: 'error',
              error: 'Publish at least one episode before publishing the topic.',
              success: null,
            });
            return EMPTY;
          }
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.publishTopic(topicId).pipe(
            tap(published => patchState(store, {
              topics: store.topics().map(topic => topic.id === topicId ? published : topic),
              mutationStatus: 'success',
              success: `Topic “${published.title}” is now published.`,
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not publish the topic.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    clearError(): void {
      patchState(store, { error: null });
    },
    clearSuccess(): void {
      patchState(store, { success: null });
    },
    setLocalError(error: string): void {
      patchState(store, { error, success: null });
    },
    setLocalSuccess(success: string): void {
      patchState(store, { success, error: null });
    },
  })),
);
