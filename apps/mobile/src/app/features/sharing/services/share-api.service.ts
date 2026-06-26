import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ShareRecord, CreateShareDto, RespondToShareDto,
  ShareNotificationList,
} from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ShareApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/shares`;

  createShare(dto: CreateShareDto): Observable<ShareRecord> {
    return this.http.post<ShareRecord>(this.apiUrl, dto);
  }

  getPendingShares(): Observable<ShareNotificationList> {
    return this.http.get<ShareNotificationList>(`${this.apiUrl}/pending`);
  }

  getPendingCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/pending/count`);
  }

  respondToShare(id: string, dto: RespondToShareDto): Observable<ShareRecord> {
    return this.http.post<ShareRecord>(`${this.apiUrl}/${id}/respond`, dto);
  }

  getSentShares(): Observable<ShareRecord[]> {
    return this.http.get<ShareRecord[]>(`${this.apiUrl}/sent`);
  }

  cancelShare(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  checkSyncStatus(resourceId: string): Observable<{ synced: boolean }> {
    return this.http.get<{ synced: boolean }>(
      `${this.apiUrl}/sync-links/${resourceId}/status`,
    );
  }

  unsync(resourceId: string): Observable<{ unsynced: boolean }> {
    return this.http.patch<{ unsynced: boolean }>(
      `${this.apiUrl}/sync-links/${resourceId}/unsync`, {},
    );
  }
}
