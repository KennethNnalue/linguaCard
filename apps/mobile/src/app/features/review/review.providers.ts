import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { SrsSyncHandler } from './services/srs-sync.handler';

export function provideReview(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(SrsSyncHandler));
    }),
  ]);
}
