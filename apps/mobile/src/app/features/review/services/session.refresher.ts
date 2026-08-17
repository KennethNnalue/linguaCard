import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewSessionApiService } from './review-session-api.service';
import { ReviewStore } from '../store/review.store';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { MAX_SESSION_HISTORY } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class SessionRefresher implements DataRefresher {
  readonly name = 'sessions';

  private readonly sessionApi = inject(ReviewSessionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly engagementStore = inject(EngagementStore);

  async refresh(_userId: string): Promise<void> {
    const serverSessions = await firstValueFrom(
      this.sessionApi.findRecent(MAX_SESSION_HISTORY),
    );

    // Persist server sessions locally so the device works fully offline
    const slim = serverSessions.map(s => ({
      id: s.id,
      deckId: s.deckId,
      collectionId: null as string | null,
      collectionName: null as string | null,
      startedAt: s.startedAt,
      completedAt: s.completedAt ?? s.startedAt,
      totalCards: s.totalCards,
      newCards: s.newCards,
      ratings: s.ratings,
      originalCardIds: Object.keys(s.ratings),
      reviewedCardIds: Object.keys(s.ratings),
      manuallyMasteredCardIds: [],
    }));
    await this.localData.setPendingSessions(_userId, []);
    await this.localData.setSessionHistory(_userId, slim);

    await this.reviewStore.loadHistory();
    await this.engagementStore.loadEngagement();
    await this.engagementStore.reconcileWithServer();
  }
}
