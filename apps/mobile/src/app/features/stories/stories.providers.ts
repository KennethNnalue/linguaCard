import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SyncService } from '../../core/services/sync.service';
import {
  StoryDeleteSyncHandler,
  StoryLearnedSyncHandler,
  StoryListenSyncHandler,
  StorySyncHandler,
} from './services/story-sync.handler';
import { StoryDataRefresher } from './services/story-data-refresher';
import {
  PlatformStoryQuizSyncHandler,
  PlatformStoryReadSyncHandler,
  PlatformStoryWordSyncHandler,
} from './services/platform-story-progress-sync.handler';

export function provideStories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const sync = inject(SyncService);
      sync.registerHandler(inject(StorySyncHandler));
      sync.registerHandler(inject(StoryDeleteSyncHandler));
      sync.registerHandler(inject(StoryLearnedSyncHandler));
      sync.registerHandler(inject(StoryListenSyncHandler));
      sync.registerHandler(inject(PlatformStoryReadSyncHandler));
      sync.registerHandler(inject(PlatformStoryQuizSyncHandler));
      sync.registerHandler(inject(PlatformStoryWordSyncHandler));
      sync.registerRefresher(inject(StoryDataRefresher));
    }),
  ]);
}
