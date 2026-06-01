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
    const cards = await firstValueFrom(this.api.getAll());
    await this.localData.setCards(userId, cards);
    await this.localData.setLastSyncedAt('cards', new Date().toISOString());
    // Patch the live store so UI reflects fresh data without re-navigation
    this.cardStore.setCardsFromSync(cards);
  }
}
