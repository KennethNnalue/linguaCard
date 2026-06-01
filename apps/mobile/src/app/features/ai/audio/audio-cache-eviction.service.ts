import { Injectable, inject } from '@angular/core';
import type { Story } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from './ai-audio-cache.service';
import { environment } from '../../../../environments/environment';

const env = environment as unknown as { audioCacheSoftLimitMb?: number; audioCacheTargetMb?: number };
const SOFT_LIMIT_BYTES = env.audioCacheSoftLimitMb
  ? env.audioCacheSoftLimitMb * 1024 * 1024
  : 180 * 1024 * 1024; // 180 MB

const TARGET_BYTES = env.audioCacheTargetMb
  ? env.audioCacheTargetMb * 1024 * 1024
  : 150 * 1024 * 1024; // 150 MB

/** Estimates audio file size from story duration (128kbps mp3 ≈ 16kB/s). */
function estimateSizeBytes(story: Story): number {
  return Math.round((story.audioDurationMs / 1000) * 16_000);
}

@Injectable({ providedIn: 'root' })
export class AudioCacheEvictionService {
  private readonly audioCache = inject(AiAudioCacheService);

  async evictIfNeeded(stories: Story[]): Promise<void> {
    const currentSize = await this.audioCache.getCacheSize();
    if (currentSize < SOFT_LIMIT_BYTES) return;

    // Sort by LRU — evict oldest-listened first; never-listened go last
    const sorted = [...stories].sort((a, b) => {
      if (!a.lastListenedAt && !b.lastListenedAt) return 0;
      if (!a.lastListenedAt) return 1;
      if (!b.lastListenedAt) return -1;
      return new Date(a.lastListenedAt).getTime() - new Date(b.lastListenedAt).getTime();
    });

    let freed = 0;
    for (const story of sorted) {
      if (currentSize - freed <= TARGET_BYTES) break;
      const cached = await this.audioCache.getFromCache(story.id);
      if (cached) {
        await this.audioCache.evict(story.id);
        freed += estimateSizeBytes(story);
      }
    }

    console.debug(`[AudioCacheEviction] freed ~${Math.round(freed / 1024)}kB; estimated remaining ~${Math.round((currentSize - freed) / 1024 / 1024)}MB`);
  }
}
