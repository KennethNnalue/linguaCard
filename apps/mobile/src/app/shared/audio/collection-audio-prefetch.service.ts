import { inject, Injectable } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { WordAudioApiService } from './word-audio-api.service';
import { AudioReadinessStore } from './audio-readiness.store';
import { normalizeForAudio } from './normalize';

const CHUNK_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class CollectionAudioPrefetchService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly readiness = inject(AudioReadinessStore);

  /**
   * Fire-and-forget. Do NOT await from import flows.
   * Caller continues immediately; audio arrives in the background.
   */
  prefetchCollection(cards: Card[]): void {
    this._run(cards).catch(err => console.warn('[AudioPrefetch] failed:', err));
  }

  private async _run(cards: Card[]): Promise<void> {
    const words = cards.map(c => ({
      text: (c.content.article ? `${c.content.article} ` : '') + c.content.back,
      language: 'de-DE',
    }));

    // Mark all pending immediately so UI can react
    for (const w of words) {
      const key = this._cacheKey(w.text, w.language);
      // Skip if already ready to avoid resetting a completed state
      const existing = this.readiness.getStatus(key)();
      if (existing !== 'ready') {
        this.readiness.markPending(key);
      }
    }

    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      const chunk = words.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await this.api.batchResolve(chunk);
        for (const item of resp.results) {
          const audioUrl = item.wordAudio.audioUrl;
          if (!audioUrl) continue;
          const key = this._cacheKey(item.wordAudio.displayText, item.wordAudio.language);
          try {
            // Check device cache first to avoid re-downloading
            const existing = await this.cache.getFromCache(key);
            if (existing) {
              this.readiness.markReady(key);
              continue;
            }
            await this.cache.saveFromUrl(key, audioUrl);
            this.readiness.markReady(key);
          } catch {
            this.readiness.markFailed(key);
          }
        }
      } catch (err) {
        console.warn('[AudioPrefetch] chunk failed:', err);
        // Mark remaining words in this chunk as failed
        for (const w of chunk) {
          const key = this._cacheKey(w.text, w.language);
          this.readiness.markFailed(key);
        }
      }
    }
  }

  private _cacheKey(text: string, language: string): string {
    return `wa-${language}-${normalizeForAudio(text, language)}`;
  }
}
