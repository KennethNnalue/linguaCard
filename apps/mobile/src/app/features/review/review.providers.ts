import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { SessionSyncHandler } from './services/session-sync.handler';
import { SessionRefresher } from './services/session.refresher';
import { ReviewCommitSyncHandler } from './services/review-commit-sync.handler';

export function provideReview(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(ReviewCommitSyncHandler));
      sync.registerHandler(inject(SessionSyncHandler));
      sync.registerRefresher(inject(SessionRefresher));
    }),
  ]);
}
