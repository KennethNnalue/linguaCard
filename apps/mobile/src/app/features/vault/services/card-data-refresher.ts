import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { CardApiService } from './card-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { CardStore } from '../store/card.store';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { overlayLocalSchedulingStates } from '../../review/domain/review-persistence';

const REFRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class CardDataRefresher implements DataRefresher {
  readonly name = 'cards';
  private readonly api = inject(CardApiService);
  private readonly localData = inject(LocalDataService);
  private readonly cardStore = inject(CardStore);
  private readonly reviewLocal = inject(ReviewLocalRepository);

  async refresh(userId: string): Promise<void> {
    if (!navigator.onLine) return;

    const lastSynced = await this.localData.getLastSyncedAt('cards');
    if (lastSynced && Date.now() - new Date(lastSynced).getTime() < REFRESH_TTL_MS) return;

    const serverCards = await firstValueFrom(this.api.getAll());

    const schedulingStates = await this.reviewLocal.schedulingStates(userId);
    const mergedCards = overlayLocalSchedulingStates(serverCards, schedulingStates);

    await this.localData.setCards(userId, mergedCards);
    await this.localData.setLastSyncedAt('cards', new Date().toISOString());
    this.cardStore.setCardsFromSync(mergedCards);
  }
}
