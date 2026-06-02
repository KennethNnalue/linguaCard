import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/subscriptions`;

  getMyStatus(): Observable<SubscriptionStatus> {
    return this.http.get<SubscriptionStatus>(`${this.baseUrl}/me`);
  }
}
