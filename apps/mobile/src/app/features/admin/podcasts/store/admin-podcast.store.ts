import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import type {
  AdminCreatePodcastEpisodeDto,
  AdminCreatePodcastTopicDto,
  AdminPodcastTopicListItem,
  AdminPodcastTranscriptPayload,
  AdminPodcastTranscriptPreview,
  AdminUpdatePodcastTopicDto,
} from '@lingua-card/shared/domain';
import { EMPTY, Observable, catchError, exhaustMap, pipe, switchMap, takeWhile, tap, timer } from 'rxjs';
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
  lastCreatedTopicId: string | null;
  lastCreatedEpisodeId: string | null;
  lastUploadedTopicThumbnailId: string | null;
  lastUploadedEpisodeThumbnailId: string | null;
  elevenLabsProjects: Record<string, string>;
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
  lastCreatedTopicId: null,
  lastCreatedEpisodeId: null,
  lastUploadedTopicThumbnailId: null,
  lastUploadedEpisodeThumbnailId: null,
  elevenLabsProjects: {},
};

export interface UpdateTopicCommand {
  topicId: string;
  dto: AdminUpdatePodcastTopicDto;
}

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

export interface GenerateTranscriptCommand {
  episodeId: string;
  vocabulary: string[];
}

function pollEpisodeGeneration(
  api: AdminPodcastApiService,
  episodeId: string,
): Observable<AdminPodcastTopicListItem[]> {
  return timer(0, 1500).pipe(
    switchMap(() => api.listTopics()),
    takeWhile(topics => {
      const current = topics.flatMap(topic => topic.episodes).find(item => item.id === episodeId);
      return current?.status === 'queued' || current?.status === 'generating';
    }, true),
  );
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
              lastCreatedTopicId: topic.id,
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
    updateTopic: rxMethod<UpdateTopicCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.updateTopic(command.topicId, command.dto).pipe(
            tap(updated => patchState(store, {
              topics: store.topics().map(topic => topic.id === command.topicId ? updated : topic),
              mutationStatus: 'success',
              success: `Topic “${updated.title}” was updated.`,
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not update the topic.'),
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
                ? { ...topic, episodes: [...topic.episodes.filter(item => item.id !== episode.id), episode]
                  .sort((a, b) => a.position - b.position) }
                : topic),
              lastCreatedEpisodeId: episode.id,
              success: 'Episode generation started. You can leave this screen safely.',
            })),
            switchMap(episode => pollEpisodeGeneration(api, episode.id).pipe(
              tap(topics => {
                const current = topics.flatMap(topic => topic.episodes).find(item => item.id === episode.id);
                const isPending = current?.status === 'queued' || current?.status === 'generating';
                const failed = !current || current.status === 'failed';
                patchState(store, {
                  topics,
                  mutationStatus: isPending ? 'loading' : failed ? 'error' : 'success',
                  error: !current ? 'The generated episode could not be found.'
                    : current.status === 'failed' ? current.generationError || 'Episode generation failed.' : null,
                  success: isPending ? 'Episode generation is in progress.'
                    : failed ? null
                      : 'Episode conversation is ready. Add artwork and create the audio next.',
                });
              }),
            )),
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
    retryEpisodeGeneration: rxMethod<string>(
      pipe(
        exhaustMap(episodeId => {
          patchState(store, { mutationStatus: 'loading', error: null, success: 'Retrying episode generation…' });
          return api.retryEpisodeGeneration(episodeId).pipe(
            switchMap(() => pollEpisodeGeneration(api, episodeId)),
            tap(topics => {
              const current = topics.flatMap(topic => topic.episodes).find(item => item.id === episodeId);
              const isPending = current?.status === 'queued' || current?.status === 'generating';
              const failed = !current || current.status === 'failed';
              patchState(store, {
                topics,
                mutationStatus: isPending ? 'loading' : failed ? 'error' : 'success',
                error: !current ? 'The generated episode could not be found.'
                  : current.status === 'failed' ? current.generationError || 'Episode generation failed.' : null,
                success: isPending ? 'Episode generation is in progress.'
                  : failed ? null : 'Episode conversation is ready.',
              });
            }),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not retry episode generation.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    createEpisodeDraft: rxMethod<string>(
      pipe(
        exhaustMap(topicId => {
          patchState(store, { mutationStatus: 'loading', error: null, success: null });
          return api.createEpisodeDraft(topicId, { requestId: crypto.randomUUID() }).pipe(
            tap(episode => patchState(store, {
              topics: store.topics().map(topic => topic.id === topicId
                ? { ...topic, episodes: [...topic.episodes, episode] }
                : topic),
              mutationStatus: 'success',
              lastCreatedEpisodeId: episode.id,
              success: 'Empty episode created. Upload the externally generated transcript next.',
            })),
            catchError(error => {
              patchState(store, {
                mutationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not create an empty episode.'),
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
              lastUploadedTopicThumbnailId: command.topicId,
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
              lastUploadedEpisodeThumbnailId: command.episodeId,
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
    generateTranscript: rxMethod<GenerateTranscriptCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, {
            transcriptEpisodeId: command.episodeId, transcriptPayload: null,
            transcriptPreview: null, transcriptStatus: 'loading', error: null, success: null,
          });
          return api.generateTranscript(command.episodeId, command.vocabulary).pipe(
            exhaustMap(generated => {
              patchState(store, {
                transcriptPayload: generated.payload,
                transcriptPreview: generated.preview,
                transcriptStatus: generated.preview.status === 'valid' ? 'loading' : 'success',
              });
              if (generated.preview.status !== 'valid') return EMPTY;
              return api.commitTranscript(
                command.episodeId, generated.preview.fingerprint, generated.payload,
              ).pipe(
                tap(result => patchState(store, {
                  topics: store.topics().map(topic => ({
                    ...topic,
                    episodes: topic.episodes.map(episode => episode.id === command.episodeId
                      ? {
                        ...episode, title: result.title,
                        titleTranslation: result.titleTranslation,
                        description: result.description, hasTranscript: true,
                        estimatedDurationMs: result.estimatedDurationMs,
                      }
                      : episode),
                  })),
                  transcriptStatus: 'success', transcriptPayload: null,
                  success: 'Transcript generated and saved. It is ready for ElevenLabs audio.',
                })),
              );
            }),
            catchError(error => {
              patchState(store, {
                transcriptStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not generate the transcript.'),
              });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    createElevenLabsPodcast: rxMethod<GenerateTranscriptCommand>(
      pipe(
        exhaustMap(command => {
          patchState(store, {
            audioGenerationEpisodeId: command.episodeId,
            audioGenerationStatus: 'loading', error: null, success: null,
          });
          return api.createElevenLabsPodcast(command.episodeId, command.vocabulary).pipe(
            tap(result => patchState(store, {
              topics: store.topics().map(topic => ({
                ...topic,
                episodes: topic.episodes.map(episode => episode.id === command.episodeId
                  ? { ...episode, elevenLabsProjectId: result.projectId }
                  : episode),
              })),
              elevenLabsProjects: {
                ...store.elevenLabsProjects(), [command.episodeId]: result.projectId,
              },
              audioGenerationStatus: 'success',
              success: `ElevenLabs Studio project ${result.projectId} is generating the podcast.`,
            })),
            catchError(error => {
              patchState(store, {
                audioGenerationStatus: 'error',
                error: adminPodcastErrorMessage(error, 'Could not start the ElevenLabs podcast.'),
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
