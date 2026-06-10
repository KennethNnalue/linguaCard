import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { SettingsApiService } from './settings-api.service';
import { SettingsStore } from '../store/settings.store';

@Injectable({ providedIn: 'root' })
export class SettingsRefresher implements DataRefresher {
  readonly name = 'settings';

  private readonly api = inject(SettingsApiService);
  private readonly settingsStore = inject(SettingsStore);

  async refresh(_userId: string): Promise<void> {
    if (!navigator.onLine) return;
    const settings = await firstValueFrom(this.api.get());
    this.settingsStore.setFromServer(settings);
  }
}
