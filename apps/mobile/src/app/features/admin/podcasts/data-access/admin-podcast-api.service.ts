import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AdminCreatePodcastEpisodeDto,
  AdminCreatePodcastEpisodeDraftDto,
  AdminCreatePodcastTopicDto,
  AdminPodcastEpisodeListItem,
  AdminPodcastTopicListItem,
  AdminPodcastTranscriptPayload,
  AdminPodcastTranscriptPreview,
  AdminCommitPodcastTranscriptResult,
  AdminGeneratePodcastAudioResult,
  AdminGeneratePodcastTranscriptResult,
  AdminCreateElevenLabsPodcastResult,
  AdminPodcastTranscriptPromptResult,
  AdminUpdatePodcastTopicDto,
  PodcastThumbnail,
} from '@lingua-card/shared/domain';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

export interface PodcastThumbnailUpload {
  file: File;
  accessibilityDescription: string;
  focalPointX: number;
  focalPointY: number;
}

@Injectable({ providedIn: 'root' })
export class AdminPodcastApiService {
  private readonly http = inject(HttpClient);
  private readonly topicUrl = `${environment.apiUrl}/admin/podcast-topics`;
  private readonly episodeUrl = `${environment.apiUrl}/admin/podcast-episodes`;

  listTopics(): Observable<AdminPodcastTopicListItem[]> {
    return this.http.get<AdminPodcastTopicListItem[]>(this.topicUrl);
  }

  createTopic(dto: AdminCreatePodcastTopicDto): Observable<AdminPodcastTopicListItem> {
    return this.http.post<AdminPodcastTopicListItem>(this.topicUrl, dto);
  }

  updateTopic(
    topicId: string,
    dto: AdminUpdatePodcastTopicDto,
  ): Observable<AdminPodcastTopicListItem> {
    return this.http.patch<AdminPodcastTopicListItem>(`${this.topicUrl}/${topicId}`, dto);
  }

  createEpisode(
    topicId: string,
    dto: AdminCreatePodcastEpisodeDto,
  ): Observable<AdminPodcastEpisodeListItem> {
    return this.http.post<AdminPodcastEpisodeListItem>(
      `${this.topicUrl}/${topicId}/episodes`,
      dto,
    );
  }

  createEpisodeDraft(
    topicId: string,
    dto: AdminCreatePodcastEpisodeDraftDto,
  ): Observable<AdminPodcastEpisodeListItem> {
    return this.http.post<AdminPodcastEpisodeListItem>(
      `${this.topicUrl}/${topicId}/episode-drafts`, dto,
    );
  }

  retryEpisodeGeneration(episodeId: string): Observable<AdminPodcastEpisodeListItem> {
    return this.http.post<AdminPodcastEpisodeListItem>(
      `${this.episodeUrl}/${episodeId}/retry-generation`, {},
    );
  }

  uploadTopicThumbnail(
    topicId: string,
    upload: PodcastThumbnailUpload,
  ): Observable<PodcastThumbnail> {
    return this.http.post<PodcastThumbnail>(
      `${this.topicUrl}/${topicId}/thumbnail`,
      this.toThumbnailFormData(upload),
    );
  }

  uploadEpisodeThumbnail(
    episodeId: string,
    upload: PodcastThumbnailUpload,
  ): Observable<PodcastThumbnail> {
    return this.http.post<PodcastThumbnail>(
      `${this.episodeUrl}/${episodeId}/thumbnail`,
      this.toThumbnailFormData(upload),
    );
  }

  previewTranscript(
    episodeId: string,
    payload: AdminPodcastTranscriptPayload,
  ): Observable<AdminPodcastTranscriptPreview> {
    return this.http.post<AdminPodcastTranscriptPreview>(
      `${this.episodeUrl}/${episodeId}/transcript/preview`, payload,
    );
  }

  commitTranscript(
    episodeId: string,
    fingerprint: string,
    payload: AdminPodcastTranscriptPayload,
  ): Observable<AdminCommitPodcastTranscriptResult> {
    return this.http.post<AdminCommitPodcastTranscriptResult>(
      `${this.episodeUrl}/${episodeId}/transcript`, { fingerprint, payload },
    );
  }

  generateAudio(episodeId: string): Observable<AdminGeneratePodcastAudioResult> {
    return this.http.post<AdminGeneratePodcastAudioResult>(
      `${this.episodeUrl}/${episodeId}/generate-audio`, {},
    );
  }

  generateTranscript(
    episodeId: string,
    vocabulary: string[],
  ): Observable<AdminGeneratePodcastTranscriptResult> {
    return this.http.post<AdminGeneratePodcastTranscriptResult>(
      `${this.episodeUrl}/${episodeId}/transcript/generate`, { vocabulary },
    );
  }

  createTranscriptPrompt(
    episodeId: string,
    vocabulary: string[],
  ): Observable<AdminPodcastTranscriptPromptResult> {
    return this.http.post<AdminPodcastTranscriptPromptResult>(
      `${this.episodeUrl}/${episodeId}/transcript/prompt`, { vocabulary },
    );
  }

  createElevenLabsPodcast(
    episodeId: string,
    vocabulary: string[],
  ): Observable<AdminCreateElevenLabsPodcastResult> {
    return this.http.post<AdminCreateElevenLabsPodcastResult>(
      `${this.episodeUrl}/${episodeId}/elevenlabs-podcast`, { vocabulary },
    );
  }

  publishEpisode(episodeId: string): Observable<AdminPodcastEpisodeListItem> {
    return this.http.patch<AdminPodcastEpisodeListItem>(
      `${this.episodeUrl}/${episodeId}/publish`, {},
    );
  }

  publishTopic(topicId: string): Observable<AdminPodcastTopicListItem> {
    return this.http.patch<AdminPodcastTopicListItem>(`${this.topicUrl}/${topicId}/publish`, {});
  }

  private toThumbnailFormData(upload: PodcastThumbnailUpload): FormData {
    const formData = new FormData();
    formData.append('image', upload.file);
    formData.append('accessibilityDescription', upload.accessibilityDescription);
    formData.append('focalPointX', String(upload.focalPointX));
    formData.append('focalPointY', String(upload.focalPointY));
    return formData;
  }
}
