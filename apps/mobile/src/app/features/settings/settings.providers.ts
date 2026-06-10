import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { SettingsSyncHandler } from './services/settings-sync.handler';
import { SettingsRefresher } from './services/settings.refresher';

export function provideSettings(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(SettingsSyncHandler));
      sync.registerRefresher(inject(SettingsRefresher));
    }),
  ]);
}
