import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { SrsSyncHandler } from './services/srs-sync.handler';
import { SessionSyncHandler } from './services/session-sync.handler';
import { SessionRefresher } from './services/session.refresher';

export function provideReview(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(SrsSyncHandler));
      sync.registerHandler(inject(SessionSyncHandler));
      sync.registerRefresher(inject(SessionRefresher));
    }),
  ]);
}
