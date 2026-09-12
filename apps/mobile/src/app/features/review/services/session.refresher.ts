import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewSessionApiService } from './review-session-api.service';
import { ReviewStore } from '../store/review.store';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { MAX_SESSION_HISTORY, type ReviewSessionHistoryEntry } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class SessionRefresher implements DataRefresher {
  readonly name = 'sessions';

  private readonly sessionApi = inject(ReviewSessionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly engagementStore = inject(EngagementStore);

  async refresh(userId: string): Promise<void> {
    const serverSessions = await firstValueFrom(
      this.sessionApi.findRecent(MAX_SESSION_HISTORY),
    );

    const sessions: ReviewSessionHistoryEntry[] = serverSessions.map(s => ({
      id: s.id,
      collectionId: null,
      collectionName: null,
      startedAt: s.startedAt,
      completedAt: s.completedAt ?? s.startedAt,
      totalCards: s.totalCards,
      newCards: s.newCards,
      ratings: s.ratings,
      originalCardIds: Object.keys(s.ratings),
      reviewedCardIds: Object.keys(s.ratings),
      manuallyMasteredCardIds: [],
    }));
    await this.localData.setPendingSessions(userId, []);
    await this.localData.setSessionHistory(userId, sessions);

    await this.reviewStore.refreshHistory(userId);
    await this.engagementStore.loadEngagement();
    await this.engagementStore.reconcileWithServer();
  }
}
