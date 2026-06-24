import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  AdoptPlatformStoryResult,
  PlatformStory,
  PlatformStoryCard,
  StoryCategory,
  StoryDifficulty,
  UserStoryProgress,
} from '@lingua-card/shared/domain';

export interface PlatformStoriesResponse {
  stories: PlatformStoryCard[];
  total: number;
}

export interface PlatformStoryFilters {
  level?: StoryDifficulty;
  category?: StoryCategory;
  /** ISO code; when set, only stories in this translation language are returned. */
  nativeLang?: string;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class PlatformStoryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/platform-stories`;

  getAll(filters: PlatformStoryFilters = {}): Observable<PlatformStoriesResponse> {
    let params = new HttpParams();
    if (filters.level)      params = params.set('level',      filters.level);
    if (filters.category)   params = params.set('category',   filters.category);
    if (filters.nativeLang) params = params.set('nativeLang', filters.nativeLang);
    if (filters.limit)      params = params.set('limit',      String(filters.limit));
    if (filters.offset)     params = params.set('offset',     String(filters.offset));
    return this.http.get<PlatformStoriesResponse>(this.baseUrl, { params });
  }

  getById(id: string): Observable<PlatformStory> {
    return this.http.get<PlatformStory>(`${this.baseUrl}/${id}`);
  }

  /** Copy this platform story into the user's own stories ("Add to my stories"). Idempotent. */
  adopt(id: string): Observable<AdoptPlatformStoryResult> {
    return this.http.post<AdoptPlatformStoryResult>(`${this.baseUrl}/${id}/adopt`, {});
  }

  getProgress(storyId: string): Observable<UserStoryProgress | null> {
    return this.http.get<UserStoryProgress | null>(`${this.baseUrl}/${storyId}/progress`);
  }

  markAsRead(storyId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${storyId}/read`, {});
  }

  saveQuizScore(storyId: string, score: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${storyId}/quiz-score`, { score });
  }

  addSavedWord(storyId: string, wordId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${storyId}/saved-words`, { wordId });
  }
}
