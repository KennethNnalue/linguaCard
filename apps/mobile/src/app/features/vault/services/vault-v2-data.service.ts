import { inject, Injectable } from '@angular/core';
import type { CardView } from '@lingua-card/shared/domain';
import { EMPTY, expand, firstValueFrom, forkJoin, reduce } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CachedVaultSnapshot, LocalDataService } from '../../../core/services/local-data.service';
import { VaultV2ApiService } from '../data-access/vault-v2-api.service';

@Injectable({ providedIn: 'root' })
export class VaultV2DataService {
  private readonly api = inject(VaultV2ApiService);
  private readonly localData = inject(LocalDataService);
  private readonly auth = inject(AuthService);
  private refreshInFlight: Promise<CachedVaultSnapshot> | null = null;

  async loadCachedSnapshot(): Promise<CachedVaultSnapshot | null> {
    const userId = this.auth.currentUser()?.id;
    return userId ? this.localData.getVaultSnapshot(userId) : null;
  }

  async refreshSnapshot(): Promise<CachedVaultSnapshot> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.fetchAndPersistSnapshot()
        .finally(() => { this.refreshInFlight = null; });
    }
    return this.refreshInFlight;
  }

  private async fetchAndPersistSnapshot(): Promise<CachedVaultSnapshot> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) throw new Error('A signed-in user is required to load the Vault');

    const context = await firstValueFrom(this.api.loadActiveContext());
    const result = await firstValueFrom(forkJoin({
      vault: this.api.loadVault(context.id),
      learningItems: this.api.listLearningItems({ learningContextId: context.id, limit: 100 }).pipe(
        expand(page => page.nextCursor
          ? this.api.listLearningItems({ learningContextId: context.id, cursor: page.nextCursor, limit: 100 })
          : EMPTY),
        reduce((items, page) => [...items, ...page.items], [] as CardView[]),
      ),
    }));
    const snapshot: CachedVaultSnapshot = {
      learningContextId: context.id,
      vault: result.vault,
      learningItems: result.learningItems,
      cachedAt: new Date().toISOString(),
    };
    await this.localData.setVaultSnapshot(userId, snapshot);
    return snapshot;
  }
}
