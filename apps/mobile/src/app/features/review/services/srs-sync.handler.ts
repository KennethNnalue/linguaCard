import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { LocalDataService, PendingSrsRating } from '../../../core/services/local-data.service';
import { CardApiService } from '../../vault/services/card-api.service';
import { CardStore } from '../../vault/store/card.store';

@Injectable({ providedIn: 'root' })
export class SrsSyncHandler implements SyncHandler {
  readonly type = 'FLUSH_SRS_RATINGS' as const;

  private readonly localData = inject(LocalDataService);
  private readonly cardApi = inject(CardApiService);
  private readonly cardStore = inject(CardStore);

  async execute(payload: unknown): Promise<void> {
    const { userId } = payload as { userId: string };
    if (!userId) return;

    const pending = await this.localData.getPendingSrsRatings(userId);
    if (pending.length === 0) return;

    // Deduplicate: keep latest rating per cardId
    const deduped = Object.values(
      pending.reduce(
        (acc, r) => {
          const existing = acc[r.cardId];
          if (!existing || r.reviewedAt > existing.reviewedAt) acc[r.cardId] = r;
          return acc;
        },
        {} as Record<string, PendingSrsRating>
      )
    );

    await firstValueFrom(this.cardApi.batchRateSrs(deduped));
    await this.localData.setPendingSrsRatings(userId, []);

    // Refresh card store so SRS state reflects the flushed ratings
    this.cardStore.loadCards();
  }
}
