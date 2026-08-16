import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { engagementDayKey } from '../domain/engagement-domain';
import { EngagementDashboard } from '../models/engagement-view.models';
import { EngagementDayView } from '../models/engagement-view.models';
import { StreakFreezeTransaction } from '../domain/engagement-domain';

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
  streakFreezeProgress: { daysTowardNext: number; interval: number; atCapacity: boolean };
  streakFreezeTransactions: readonly {
    transactionId: string;
    userId: string;
    occurredAt: string;
    amount: number;
    reason: StreakFreezeTransaction['reason'];
    protectedDayKey: string | null;
    sourceId: string;
  }[];
  recentDays: readonly {
    dayKey: string;
    reviewed: number;
    goal: number;
    status: EngagementDayView['status'];
  }[];
}

export interface ServerEngagementSnapshot {
  dashboard: EngagementDashboard;
  recentDays: readonly EngagementDayView[];
  streakFreezeTransactions: readonly StreakFreezeTransaction[];
}

@Injectable({ providedIn: 'root' })
export class EngagementApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/engagement`;

  dashboard(): Observable<ServerEngagementSnapshot> {
    return this.http.get<EngagementDashboardDto>(`${this.baseUrl}/dashboard`).pipe(
      map(response => ({
        dashboard: {
          today: response.today,
          streak: {
            ...response.streak,
            lastQualifiedDayKey: response.streak.lastQualifiedDayKey
              ? engagementDayKey(response.streak.lastQualifiedDayKey)
              : null,
          },
          learningPoints: response.learningPoints,
          streakFreezes: response.streakFreezes,
          streakFreezeProgress: response.streakFreezeProgress,
        },
        recentDays: response.recentDays.map(day => ({ ...day, dayKey: engagementDayKey(day.dayKey) })),
        streakFreezeTransactions: response.streakFreezeTransactions.map(transaction => ({
          transactionId: transaction.transactionId,
          userId: transaction.userId,
          occurredAt: new Date(transaction.occurredAt),
          amount: transaction.amount,
          reason: transaction.reason,
          protectedDayKey: transaction.protectedDayKey
            ? engagementDayKey(transaction.protectedDayKey)
            : undefined,
          sourceId: transaction.sourceId,
        })),
      })),
    );
  }
}
