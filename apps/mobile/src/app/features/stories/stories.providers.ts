import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import { StorySyncHandler, StoryDeleteSyncHandler } from './services/story-sync.handler';
import { StoryDataRefresher } from './services/story-data-refresher';

export function provideStories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(StorySyncHandler));
      sync.registerHandler(inject(StoryDeleteSyncHandler));
      sync.registerRefresher(inject(StoryDataRefresher));
    }),
  ]);
}
