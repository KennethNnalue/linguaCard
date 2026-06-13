import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  PlatformCollectionListResponse,
  PlatformCollectionDetail,
  AdoptPlatformCollectionResult,
} from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PlatformCollectionApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/platform-collections`;

  getAll(): Observable<PlatformCollectionListResponse> {
    return this.http.get<PlatformCollectionListResponse>(this.apiUrl);
  }

  getById(id: string): Observable<PlatformCollectionDetail> {
    return this.http.get<PlatformCollectionDetail>(`${this.apiUrl}/${id}`);
  }

  adopt(id: string): Observable<AdoptPlatformCollectionResult> {
    return this.http.post<AdoptPlatformCollectionResult>(`${this.apiUrl}/${id}/adopt`, {});
  }
}
