import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataRefresher } from '../../../core/models/data-refresher.model';
import { StoryApiService } from './story-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { StoryStore } from '../store/story.store';
import { StoryAudioPrefetchService } from './story-audio-prefetch.service';

@Injectable({ providedIn: 'root' })
export class StoryDataRefresher implements DataRefresher {
  readonly name = 'stories';
  private readonly api = inject(StoryApiService);
  private readonly localData = inject(LocalDataService);
  private readonly storyStore = inject(StoryStore);
  private readonly audioPrefetch = inject(StoryAudioPrefetchService);

  async refresh(userId: string): Promise<void> {
    const stories = await firstValueFrom(this.api.getAll());
    await this.localData.setStories(userId, stories);
    await this.localData.setLastSyncedAt('stories', new Date().toISOString());
    this.storyStore.setStoriesFromSync(stories);
    // Fire-and-forget audio pre-fetch — never blocks sync
    void this.audioPrefetch.prefetchAll();
  }
}
