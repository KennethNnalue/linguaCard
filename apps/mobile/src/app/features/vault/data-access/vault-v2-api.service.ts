import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CardView, CursorPage, LearningContextView, VaultView } from '@lingua-card/shared/domain';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ListLearningItemsRequest {
  learningContextId: string;
  collectionId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class VaultV2ApiService {
  private readonly http = inject(HttpClient);
  private readonly v2Url = `${environment.apiUrl}/v2`;

  loadVault(learningContextId: string): Observable<VaultView> {
    return this.http.get<VaultView>(`${this.v2Url}/vault`, {
      params: { learningContextId },
    });
  }

  loadActiveContext(): Observable<LearningContextView> {
    return this.http.get<LearningContextView>(`${this.v2Url}/vault/active-context`);
  }

  listLearningItems(request: ListLearningItemsRequest): Observable<CursorPage<CardView>> {
    let params = new HttpParams().set('learningContextId', request.learningContextId);
    if (request.collectionId) params = params.set('collectionId', request.collectionId);
    if (request.query) params = params.set('query', request.query);
    if (request.cursor) params = params.set('cursor', request.cursor);
    if (request.limit !== undefined) params = params.set('limit', request.limit);
    return this.http.get<CursorPage<CardView>>(`${this.v2Url}/learning-items`, { params });
  }
}
