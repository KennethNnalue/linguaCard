import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { CollectionApiService } from './collection-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { CollectionStore } from '../store/collection.store';

const REFRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class CollectionDataRefresher implements DataRefresher {
  readonly name = 'collections';
  private readonly api = inject(CollectionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly collectionStore = inject(CollectionStore);

  async refresh(userId: string): Promise<void> {
    if (!navigator.onLine) return;

    const lastSynced = await this.localData.getLastSyncedAt('collections');
    if (lastSynced && Date.now() - new Date(lastSynced).getTime() < REFRESH_TTL_MS) return;

    const collections = await firstValueFrom(this.api.getAll());
    await this.localData.setCollections(userId, collections);
    await this.localData.setLastSyncedAt('collections', new Date().toISOString());
    this.collectionStore.setCollectionsFromSync(collections);
  }
}
