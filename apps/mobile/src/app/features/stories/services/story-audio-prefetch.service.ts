import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import type { Story } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { AudioCacheEvictionService } from '../../ai/audio/audio-cache-eviction.service';
import { StoryStore } from '../store/story.store';

@Injectable({ providedIn: 'root' })
export class StoryAudioPrefetchService {
  private readonly audioCache = inject(AiAudioCacheService);
  private readonly eviction = inject(AudioCacheEvictionService);
  private readonly storyStore = inject(StoryStore);

  async prefetchAll(): Promise<void> {
    if (!navigator.onLine) return;

    // On native, only pre-fetch on WiFi to avoid cellular data usage
    if (Capacitor.isNativePlatform()) {
      const { connectionType } = await Network.getStatus();
      if (connectionType !== 'wifi') return;
    }

    const stories = this.storyStore.stories();

    // Evict before downloading new content
    await this.eviction.evictIfNeeded(stories);

    const uncached = await this.filterUncached(stories);

    // Sequential download to avoid saturating bandwidth
    for (const story of uncached) {
      if (!navigator.onLine) break;
      if (story.audioUrl) {
        await this.audioCache.getOrDownload(story.id, story.audioUrl).catch(() => null);
      }
    }
  }

  private async filterUncached(stories: Story[]): Promise<Story[]> {
    const results = await Promise.all(
      stories.map(async (s) => {
        const cached = await this.audioCache.getFromCache(s.id);
        return cached ? null : s;
      })
    );
    return results.filter((s): s is Story => s !== null);
  }
}
