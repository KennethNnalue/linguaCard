import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { engagementDayKey } from '../domain/engagement-domain';
import { EngagementDashboard } from '../models/engagement-view.models';

interface EngagementDashboardDto {
  today: { reviewed: number; goal: number; goalComplete: boolean };
  streak: {
    current: number;
    longest: number;
    state: 'safe' | 'at_risk' | 'broken';
    lastQualifiedDayKey: string | null;
  };
  learningPoints: number;
  streakFreezes: number;
}

@Injectable({ providedIn: 'root' })
export class EngagementApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/engagement`;

  dashboard(): Observable<EngagementDashboard> {
    return this.http.get<EngagementDashboardDto>(`${this.baseUrl}/dashboard`).pipe(
      map(response => ({
        ...response,
        streak: {
          ...response.streak,
          lastQualifiedDayKey: response.streak.lastQualifiedDayKey
            ? engagementDayKey(response.streak.lastQualifiedDayKey)
            : null,
        },
      })),
    );
  }
}
