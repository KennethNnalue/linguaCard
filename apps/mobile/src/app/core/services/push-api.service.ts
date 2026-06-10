import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PushSubscriptionDto } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class PushApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/push`;

  vapidPublicKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(`${this.base}/vapid-public-key`);
  }

  subscribe(sub: PushSubscriptionDto): Observable<void> {
    return this.http.post<void>(`${this.base}/subscribe`, sub);
  }

  unsubscribe(endpoint: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/unsubscribe`, { body: { endpoint } });
  }
}
