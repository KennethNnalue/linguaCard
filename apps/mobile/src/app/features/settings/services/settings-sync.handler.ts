import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import type { UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import { SettingsApiService } from './settings-api.service';
import { SettingsStore } from '../store/settings.store';

@Injectable({ providedIn: 'root' })
export class SettingsSyncHandler implements SyncHandler {
  readonly type = 'PATCH_SETTINGS';

  private readonly api = inject(SettingsApiService);
  private readonly settingsStore = inject(SettingsStore);

  async execute(payload: unknown): Promise<void> {
    const dto = payload as UpdateUserSettingsDto;
    const saved = await firstValueFrom(this.api.update(dto));
    // Reconcile store with the server's canonical response
    this.settingsStore.setFromServer(saved);
  }
}
