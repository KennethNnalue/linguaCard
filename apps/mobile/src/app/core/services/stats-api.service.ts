import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class StatsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/stats`;

  streak(): Observable<StreakStatus> {
    return this.http.get<StreakStatus>(`${this.base}/streak`);
  }

  goalProgress(period: GoalProgress['period'] = 'daily'): Observable<GoalProgress> {
    return this.http.get<GoalProgress>(`${this.base}/goal-progress`, { params: { period } });
  }
}
