import { Injectable, inject, signal } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { AiOrchestrationService } from '../orchestration/ai-orchestration.service';
import { AiAudioCacheService } from './ai-audio-cache.service';
import { AudioService } from '../../../shared/audio/audio.service';

@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly ai = inject(AiOrchestrationService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService);

  readonly isLoading = signal(false);

  // Deduplicates concurrent requests for the same text — a second tap while the
  // first is in-flight reuses the same Promise rather than firing another API call.
  private readonly _inflight = new Map<string, Promise<string | null>>();

  // When the backend returns 429 we stop attempting AI calls until the retry
  // window expires. Individual requests still play via Web Speech fallback.
  private _rateLimitedUntil = 0;

  /** Play AI pronunciation for a known card. Result is cached by card ID. */
  async play(card: Card): Promise<void> {
    const word = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    await this.playText(word, 'de-DE', `pronunciation-${card.id}`);
  }

  /**
   * Play AI audio for arbitrary text. `cacheKey` is optional — when provided the
   * result is cached so the same text is never generated twice.
   */
  async playText(text: string, language = 'de-DE', cacheKey?: string): Promise<void> {
    const url = await this._resolveUrl(text, language, cacheKey);
    if (url) {
      new Audio(url).play();
    } else {
      this.fallback.speak(text, language, 0.85).subscribe();
    }
  }

  /**
   * Same as playText() but resolves when the audio ends. Used by ListenStore
   * for sequential playback — awaiting this keeps the playlist in order.
   */
  async playTextAsPromise(text: string, language = 'de-DE', cacheKey?: string): Promise<void> {
    const url = await this._resolveUrl(text, language, cacheKey);
    if (url) {
      return this._playAudioElement(url);
    }
    return new Promise(resolve => {
      this.fallback.speak(text, language, 0.85).subscribe({
        next: resolve, error: resolve, complete: resolve,
      });
    });
  }

  /**
   * Resolves an audio URL for the given text:
   * 1. Cache hit  → return cached URL immediately
   * 2. Rate limited → return null (caller falls back to Web Speech)
   * 3. AI generation → fetch, cache, return URL; on error return null
   */
  private async _resolveUrl(text: string, language: string, cacheKey?: string): Promise<string | null> {
    // 1. Check persistent cache
    if (cacheKey) {
      const cached = await this.cache.getFromCache(cacheKey);
      if (cached) return cached;
    }

    // 2. Rate-limited — skip API, play via fallback
    if (Date.now() < this._rateLimitedUntil) {
      return null;
    }

    // 3. Deduplicate inflight requests for the same key
    const inflightKey = cacheKey ?? text;
    if (this._inflight.has(inflightKey)) {
      return this._inflight.get(inflightKey)!;
    }

    const request = this._fetchFromApi(text, language, cacheKey).finally(() => {
      this._inflight.delete(inflightKey);
    });
    this._inflight.set(inflightKey, request);
    return request;
  }

  private async _fetchFromApi(text: string, language: string, cacheKey?: string): Promise<string | null> {
    this.isLoading.set(true);
    try {
      const speech = await this.ai.generatePronunciation({
        cardId: cacheKey ?? text,
        word: text,
        language,
      });

      const saved = cacheKey
        ? await this.cache.saveBuffer(cacheKey, speech.audioBuffer)
        : null;

      this.isLoading.set(false);
      return saved ?? URL.createObjectURL(new Blob([speech.audioBuffer]));
    } catch (err: any) {
      this.isLoading.set(false);
      // Back off for the duration specified by the server (or 30s default)
      // Angular HttpErrorResponse exposes .status directly
      const status = err?.status;
      if (status === 429 || status === 503) {
        // headers is an Angular HttpHeaders object — use .get() if available
        const retryAfterRaw = err?.headers?.get?.('Retry-After') ?? err?.error?.retryAfterMs;
        const retryAfterMs = typeof retryAfterRaw === 'number'
          ? retryAfterRaw
          : parseInt(String(retryAfterRaw ?? '30'), 10) * 1000;
        this._rateLimitedUntil = Date.now() + retryAfterMs;
      }
      return null;
    }
  }

  private _playAudioElement(url: string): Promise<void> {
    return new Promise(resolve => {
      const audio = new Audio(url);
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
      audio.play().catch(() => resolve());
    });
  }
}
