import { Injectable, inject, signal } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { GeminiAdapter } from '../providers/gemini.adapter';
import { AiAudioCacheService } from './ai-audio-cache.service';
import { AudioService } from '../../../shared/audio/audio.service';

@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private readonly gemini = inject(GeminiAdapter);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService);

  readonly isLoading = signal(false);

  // In-memory map of cardId/cacheKey → persisted R2 URL.
  // Populated from the backend response and reused within a session without
  // hitting the Capacitor Filesystem again.
  private readonly _urlMap = new Map<string, string>();

  // Deduplicates concurrent requests: second tap while first is in-flight
  // reuses the same Promise instead of firing another API call.
  private readonly _inflight = new Map<string, Promise<string | null>>();

  // When the backend returns 429 we stop making AI requests until the window passes.
  private _rateLimitedUntil = 0;

  /** Play AI pronunciation for a known card. Result is persisted to R2 by card ID. */
  async play(card: Card): Promise<void> {
    const word = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    await this.playText(word, 'de-DE', card.id);
  }

  /**
   * Play AI audio for arbitrary text.
   * `cardId` is used as the persistence key when provided — the audio is stored
   * in R2 as `pronunciation/{cardId}.wav` and reused across sessions/devices.
   * Without a cardId the audio is generated on-demand and played via object URL.
   */
  async playText(text: string, language = 'de-DE', cardId?: string): Promise<void> {
    const url = await this._resolveUrl(text, language, cardId);
    if (url) {
      new Audio(url).play();
    } else {
      this.fallback.speak(text, language, 0.85).subscribe();
    }
  }

  /**
   * Same as playText() but resolves when the audio ends.
   * Used by ListenStore for sequential playback.
   */
  async playTextAsPromise(text: string, language = 'de-DE', cardId?: string): Promise<void> {
    const url = await this._resolveUrl(text, language, cardId);
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
   * Resolution order:
   * 1. In-memory URL map (same session, already fetched this key)
   * 2. Capacitor Filesystem (native device cache, survives app restarts)
   * 3. Backend /ai/pronunciation → generates + persists to R2 → returns URL
   * 4. null → caller falls back to Web Speech
   */
  private async _resolveUrl(
    text: string,
    language: string,
    cardId?: string,
  ): Promise<string | null> {
    const cacheKey = cardId ? `pronunciation-${cardId}` : null;

    // 1. In-memory map
    if (cacheKey && this._urlMap.has(cacheKey)) {
      return this._urlMap.get(cacheKey)!;
    }

    // 2. Capacitor Filesystem (native only — web returns null)
    if (cacheKey) {
      const deviceCached = await this.cache.getFromCache(cacheKey);
      if (deviceCached) {
        this._urlMap.set(cacheKey, deviceCached);
        return deviceCached;
      }
    }

    // 3. Rate-limited — skip API call entirely
    if (Date.now() < this._rateLimitedUntil) {
      return null;
    }

    // 4. Deduplicate inflight
    const inflightKey = cacheKey ?? text;
    if (this._inflight.has(inflightKey)) {
      return this._inflight.get(inflightKey)!;
    }

    const request = this._fetchAndPersist(text, language, cardId, cacheKey).finally(() => {
      this._inflight.delete(inflightKey);
    });
    this._inflight.set(inflightKey, request);
    return request;
  }

  private async _fetchAndPersist(
    text: string,
    language: string,
    cardId?: string,
    cacheKey?: string | null,
  ): Promise<string | null> {
    this.isLoading.set(true);
    try {
      if (cardId) {
        // Persisted path: backend generates + saves to R2, returns permanent URL
        const result = await this.gemini.generatePronunciationUrl(cardId, text, language);
        const audioUrl = result.audioUrl;

        // Store in memory for the rest of this session
        if (cacheKey) this._urlMap.set(cacheKey, audioUrl);

        // Also cache locally on native for offline playback
        await this._cacheRemoteToDevice(audioUrl, cacheKey);

        this.isLoading.set(false);
        return audioUrl;
      } else {
        // No cardId — generate on-demand via /ai/tts, play once via object URL
        const speech = await this.gemini.generateSpeech({ text, language });
        this.isLoading.set(false);
        return URL.createObjectURL(new Blob([speech.audioBuffer], { type: 'audio/wav' }));
      }
    } catch (err: any) {
      this.isLoading.set(false);
      const status = err?.status;
      if (status === 429 || status === 503) {
        const retryAfterRaw = err?.headers?.get?.('Retry-After') ?? err?.error?.retryAfterMs;
        const retryAfterMs = typeof retryAfterRaw === 'number'
          ? retryAfterRaw
          : parseInt(String(retryAfterRaw ?? '30'), 10) * 1000;
        this._rateLimitedUntil = Date.now() + retryAfterMs;
      }
      return null;
    }
  }

  // Downloads a remote URL into the Capacitor Filesystem so it's available offline.
  // No-ops on web (isNative guard inside AiAudioCacheService).
  private async _cacheRemoteToDevice(remoteUrl: string, cacheKey?: string | null): Promise<void> {
    if (!cacheKey) return;
    try {
      // getOrDownload checks first — won't re-download if already present
      const localUrl = await this.cache.getOrDownload(cacheKey, remoteUrl);
      // If we got a local file URI back, update the in-memory map so subsequent
      // plays use the local file instead of the remote URL
      if (localUrl && localUrl !== remoteUrl) {
        this._urlMap.set(cacheKey, localUrl);
      }
    } catch {
      // Cache failure is non-fatal — remote URL still works
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
