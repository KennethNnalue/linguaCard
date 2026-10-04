import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PodcastClientEvent, PodcastRecommendationResponse, PodcastRecommendationPlacement,
  PodcastEpisodeCompletion, PodcastEpisodePlayer, PodcastEpisodePreparation, PodcastLibraryLevel, PodcastLibraryResponse,
  PodcastListeningProgress, PodcastTopicDetail, PreparePodcastVocabularyResult,
  SavePodcastProgressDto, PodcastOnboardingExample,
} from '@lingua-card/shared/domain';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PodcastApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/podcasts`;

  onboardingExample(collectionId: string): Observable<PodcastOnboardingExample | null> {
    return this.http.get<PodcastOnboardingExample | null>(`${this.url}/onboarding-example/${collectionId}`);
  }
  recommendations(placement: PodcastRecommendationPlacement, level: PodcastLibraryLevel, sessionId?: string): Observable<PodcastRecommendationResponse> {
    return this.http.get<PodcastRecommendationResponse>(`${this.url}/recommendations`, {
      params: { placement, level, ...(sessionId ? { sessionId } : {}) },
    });
  }
  recordEvent(event: PodcastClientEvent): Observable<void> {
    return this.http.post<void>(`${this.url}/events`, event);
  }

  listTopics(level: PodcastLibraryLevel): Observable<PodcastLibraryResponse> {
    return this.http.get<PodcastLibraryResponse>(this.url, { params: { level } });
  }

  getTopic(topicId: string): Observable<PodcastTopicDetail> {
    return this.http.get<PodcastTopicDetail>(`${this.url}/topics/${topicId}`);
  }

  getPreparation(episodeId: string): Observable<PodcastEpisodePreparation> {
    return this.http.get<PodcastEpisodePreparation>(`${this.url}/episodes/${episodeId}/preparation`);
  }

  getPlayer(episodeId: string): Observable<PodcastEpisodePlayer> {
    return this.http.get<PodcastEpisodePlayer>(`${this.url}/episodes/${episodeId}/player`);
  }

  getCompletion(episodeId: string): Observable<PodcastEpisodeCompletion> {
    return this.http.get<PodcastEpisodeCompletion>(`${this.url}/episodes/${episodeId}/completion`);
  }

  saveProgress(
    episodeId: string, dto: SavePodcastProgressDto,
  ): Observable<PodcastListeningProgress> {
    return this.http.patch<PodcastListeningProgress>(
      `${this.url}/episodes/${episodeId}/progress`, dto,
    );
  }

  prepareVocabulary(episodeId: string): Observable<PreparePodcastVocabularyResult> {
    return this.http.post<PreparePodcastVocabularyResult>(
      `${this.url}/episodes/${episodeId}/prepare-vocabulary`, {},
    );
  }
}
