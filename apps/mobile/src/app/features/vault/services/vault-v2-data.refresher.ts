import { inject, Injectable } from '@angular/core';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { LocalDataService } from '../../../core/services/local-data.service';
import { VaultV2Store } from '../store/vault-v2.store';
import { VaultV2DataService } from './vault-v2-data.service';

const REFRESH_TTL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class VaultV2DataRefresher implements DataRefresher {
  readonly name = 'vault';
  private readonly data = inject(VaultV2DataService);
  private readonly localData = inject(LocalDataService);
  private readonly store = inject(VaultV2Store);

  async refresh(userId: string): Promise<void> {
    if (!navigator.onLine) return;
    if (!userId) return;
    const lastSynced = await this.localData.getLastSyncedAt('vault');
    if (lastSynced && Date.now() - new Date(lastSynced).getTime() < REFRESH_TTL_MS) return;
    const snapshot = await this.data.refreshSnapshot();
    await this.localData.setLastSyncedAt('vault', new Date().toISOString());
    this.store.applySnapshotFromSync(snapshot);
  }
}
