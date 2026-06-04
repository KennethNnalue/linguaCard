import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { CardApiService } from './card-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { CardStore } from '../store/card.store';

@Injectable({ providedIn: 'root' })
export class CardDataRefresher implements DataRefresher {
  readonly name = 'cards';
  private readonly api = inject(CardApiService);
  private readonly localData = inject(LocalDataService);
  private readonly cardStore = inject(CardStore);

  async refresh(userId: string): Promise<void> {
    const serverCards = await firstValueFrom(this.api.getAll());

    // If there are pending SRS ratings that haven't been flushed to the server yet,
    // the server copy of those cards has stale SRS state. Preserve the optimistic
    // (locally-computed) srsState from the live store so we don't clobber it.
    const pending = await this.localData.getPendingSrsRatings(userId);
    const pendingCardIds = new Set(pending.map(r => r.cardId));

    let mergedCards = serverCards;
    if (pendingCardIds.size > 0) {
      const liveById = new Map(this.cardStore.cards().map(c => [c.id, c]));
      mergedCards = serverCards.map(serverCard => {
        if (pendingCardIds.has(serverCard.id)) {
          const live = liveById.get(serverCard.id);
          // Keep live srsState — it's ahead of what the server knows
          return live ? { ...serverCard, srsState: live.srsState } : serverCard;
        }
        return serverCard;
      });
    }

    await this.localData.setCards(userId, mergedCards);
    await this.localData.setLastSyncedAt('cards', new Date().toISOString());
    this.cardStore.setCardsFromSync(mergedCards);
  }
}
