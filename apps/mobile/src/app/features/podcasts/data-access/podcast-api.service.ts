import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PodcastEpisodeCompletion, PodcastEpisodePlayer, PodcastEpisodePreparation, PodcastLibraryResponse,
  PodcastListeningProgress, PodcastTopicDetail, PreparePodcastVocabularyResult,
  SavePodcastProgressDto,
} from '@lingua-card/shared/domain';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PodcastApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/podcasts`;

  listTopics(): Observable<PodcastLibraryResponse> {
    return this.http.get<PodcastLibraryResponse>(this.url);
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
