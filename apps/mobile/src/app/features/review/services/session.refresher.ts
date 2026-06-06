import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewSessionApiService } from './review-session-api.service';
import { ReviewStore } from '../store/review.store';
import { MAX_SESSION_HISTORY } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class SessionRefresher implements DataRefresher {
  readonly name = 'sessions';

  private readonly sessionApi = inject(ReviewSessionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly reviewStore = inject(ReviewStore);

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
      completedAt: s.completedAt,
      totalCards: s.totalCards,
      reviewedCards: s.reviewedCards,
      newCards: s.newCards,
      ratings: s.ratings,
    }));
    await this.localData.setPendingSessions(_userId, []);
    await this.localData.setSessionHistory(_userId, slim);

    // Re-hydrate the in-memory store so streak/weekly computed signals update
    await this.reviewStore.loadHistory();
  }
}
