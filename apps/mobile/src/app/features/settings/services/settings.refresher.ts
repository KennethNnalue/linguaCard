import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { SyncService } from '../../../core/services/sync.service';
import { SettingsApiService } from './settings-api.service';
import { SettingsStore } from '../store/settings.store';

@Injectable({ providedIn: 'root' })
export class SettingsRefresher implements DataRefresher {
  readonly name = 'settings';

  private readonly api = inject(SettingsApiService);
  private readonly sync = inject(SyncService);
  private readonly settingsStore = inject(SettingsStore);

  async refresh(_userId: string): Promise<void> {
    if (!navigator.onLine) return;
    const server = await firstValueFrom(this.api.get());

    // Re-apply edits still pending in the sync queue on top of the server's
    // response, so a refresh that races ahead of the queue flush doesn't
    // momentarily revert what the user just changed. The server reconciles
    // the canonical value via last-write-wins once the queue flushes.
    const pending = this.sync.pendingPayloads('PATCH_SETTINGS') as UpdateUserSettingsDto[];
    const merged = pending.reduce<UserSettings>((acc, dto) => {
      const { clientUpdatedAt: _ignored, ...fields } = dto;
      return { ...acc, ...fields };
    }, server);

    this.settingsStore.setFromServer(merged);
  }
}
