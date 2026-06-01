import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { CardSyncHandler } from './services/card-sync.handler';
import { CollectionSyncHandler } from './services/collection-sync.handler';
import { CardDataRefresher } from './services/card-data-refresher';
import { CollectionDataRefresher } from './services/collection-data-refresher';

export function provideVault(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(CardSyncHandler));
      sync.registerHandler(inject(CollectionSyncHandler));
      sync.registerRefresher(inject(CardDataRefresher));
      sync.registerRefresher(inject(CollectionDataRefresher));
    }),
  ]);
}
