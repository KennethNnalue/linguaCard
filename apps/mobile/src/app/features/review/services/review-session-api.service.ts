import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { ReviewSession } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

export interface UpsertSessionDto {
  id: string;
  deckId?: string;
  collectionId?: string | null;
  collectionName?: string | null;
  startedAt: string;
  completedAt: string | null;
  totalCards: number;
  reviewedCards: number;
  newCards: number;
  ratings: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ReviewSessionApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/review/sessions`;

  upsert(dto: UpsertSessionDto): Observable<ReviewSession> {
    return this.http.post<ReviewSession>(this.apiUrl, dto);
  }

  upsertBatch(sessions: UpsertSessionDto[]): Observable<{ upserted: number }> {
    return this.http.post<{ upserted: number }>(`${this.apiUrl}/batch`, sessions);
  }

  findRecent(limit = 50): Observable<ReviewSession[]> {
    return this.http.get<ReviewSession[]>(this.apiUrl, { params: { limit } });
  }
}
