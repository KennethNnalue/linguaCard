import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PlatformStory, UserStoryProgress } from '@lingua-card/shared/domain';
import { PlatformStoryApiService } from './platform-story-api.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';

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

  async load(id: string): Promise<PlatformStoryLoadResult | null> {
    const cached = await this.localData.getPlatformStory(id);

    // Background refresh keeps the cache fresh for the next open. Fire-and-forget;
    // resolves to null on network failure (offline).
    const networkPromise = firstValueFrom(this.api.getById(id))
      .then(fresh => { void this.localData.setPlatformStory(fresh); return fresh; })
      .catch(() => null);

    // Prefer cache for instant render + offline; fall back to network when uncached.
    let story = cached ?? (await networkPromise);
    if (!story) return null;

    // Resolve narration audio to a cached/local URL (downloads on native for offline).
    if (story.audioUrl) {
      const localUrl = await this.audioCache.getOrDownload(story.id, story.audioUrl);
      if (localUrl && localUrl !== story.audioUrl) {
        story = { ...story, audioUrl: localUrl };
      }
    }

    // Fire-and-forget read marker; progress is awaited so the page can render it.
    this.api.markAsRead(id).subscribe({ error: () => undefined });

    let progress: UserStoryProgress | null = null;
    try {
      progress = await firstValueFrom(this.api.getProgress(id));
    } catch {
      progress = null;
    }

    return { story, progress };
  }
}
