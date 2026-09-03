import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PlatformStory, UserStoryProgress } from '@lingua-card/shared/domain';
import { PlatformStoryApiService } from './platform-story-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { PlatformStoryProgressService } from './platform-story-progress.service';

export interface PlatformStoryLoadResult {
  story: PlatformStory;
  progress: UserStoryProgress | null;
}

/**
 * Orchestrates the platform-story reader's load pipeline: fetch the story, mark
 * it as read, and load the user's progress — keeping this off the page. Returns
 * `null` when the story can't be loaded (caller navigates away).
 *
 * Offline-first: a previously-opened story renders instantly from the device
 * cache and works with no network; the network copy refreshes the cache in the
 * background. Narration audio is resolved through {@link AiAudioCacheService} so
 * it plays offline on native.
 */
@Injectable({ providedIn: 'root' })
export class PlatformStoryLoaderService {
  private readonly api = inject(PlatformStoryApiService);
  private readonly localData = inject(LocalDataService);
  private readonly audioCache = inject(AiAudioCacheService);
  private readonly progressService = inject(PlatformStoryProgressService);

  async load(id: string): Promise<PlatformStoryLoadResult | null> {
    let cached: PlatformStory | null = null;
    try {
      cached = await this.localData.getPlatformStory(id);
    } catch {
      cached = null;
    }

    // Background refresh keeps the cache fresh for the next open. Fire-and-forget;
    // resolves to null on network failure (offline).
    const networkPromise = navigator.onLine ? firstValueFrom(this.api.getById(id))
      .then(fresh => { void this.localData.setPlatformStory(fresh); return fresh; })
      .catch(() => null) : Promise.resolve(null);

    // Prefer cache for instant render + offline; fall back to network when uncached.
    let story = cached ?? (await networkPromise);
    if (!story) return null;

    // Resolve narration audio to a cached/local URL (downloads on native for offline).
    if (story.audioUrl) {
      const localUrl = navigator.onLine
        ? await this.audioCache.getOrDownload(story.id, story.audioUrl)
        : await this.audioCache.getFromCache(story.id);
      story = { ...story, audioUrl: localUrl };
    }

    const progress: UserStoryProgress | null = await this.progressService.loadAndMarkRead(id);

    return { story, progress };
  }
}
