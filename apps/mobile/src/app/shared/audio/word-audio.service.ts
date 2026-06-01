import { Injectable, computed, inject, signal } from '@angular/core';
import type { Card, WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { GeminiAdapter } from '../../features/ai/providers/gemini.adapter';
import { AudioService } from './audio.service';
import { WordAudioApiService } from './word-audio-api.service';
import { normalizeForAudio } from './normalize';

@Injectable({ providedIn: 'root' })
export class WordAudioService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly gemini = inject(GeminiAdapter);
  private readonly fallback = inject(AudioService);

  // Tracks which cache keys are actively being fetched from the API.
  // isLoading is true when any word is in-flight, without one word's finish
  // incorrectly clearing the flag while others are still loading.
  private readonly _loadingKeys = signal(new Set<string>());
  readonly isLoading = computed(() => this._loadingKeys().size > 0);

  // In-memory: cacheKey → audioUrl. Populated from API responses and device cache.
  private readonly _urlMap = new Map<string, string>();

  // Deduplicates concurrent requests for the same word.
  private readonly _inflight = new Map<string, Promise<string | null>>();

  // Stop making API calls until this timestamp passes (set on 429/503).
  private _rateLimitedUntil = 0;

  /**
   * Play AI pronunciation for a card's word.
   * Builds text from article + back, then resolves via the word audio registry.
   */
  async playCard(card: Card): Promise<void> {
    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    await this.play(text, 'de-DE');
  }

  /**
   * Play AI pronunciation for arbitrary text.
   * Resolved by normalized text — same audio for "der Hund", "Der Hund", "der Hund."
   *
   * Strategy: Audio.play() MUST be called synchronously within the user-gesture
   * context — calling it after any `await` triggers autoplay-policy blocking on
   * Chrome/iOS. Therefore:
   *
   * - Memory-cache hit → play new Audio() immediately (still in gesture context).
   * - Cache miss → fall back to Web Speech synchronously (always allowed in
   *   gesture context); trigger background resolution so the next tap hits cache.
   *
   * We deliberately do NOT try to "replace" Web Speech mid-play with AI audio
   * because: (a) the replacement Audio.play() would be blocked anyway, and
   * (b) cancelling the Web Speech utterance mid-word sounds worse than silence.
   */
  async play(text: string, language = 'de-DE'): Promise<void> {
    const cacheKey = this._cacheKey(normalizeForAudio(text, language), language);
    const cached = this._urlMap.get(cacheKey);

    if (cached) {
      // In-memory hit: still within user-gesture context, play immediately.
      new Audio(cached).play().catch(() => {
        // Autoplay blocked even for cached URLs (e.g. policy changed mid-session).
        // Fall back to Web Speech so the user hears something.
        this.fallback.speak(text, language, 0.85).subscribe();
      });
      return;
    }

    // Cache miss: play Web Speech synchronously (has gesture context).
    // Kick off background resolution so the next tap hits memory cache.
    this.fallback.speak(text, language, 0.85).subscribe();
    this._backgroundResolve(text, language, cacheKey);
  }

  /**
   * Resolves and caches the audio URL in the background.
   * Does NOT attempt playback — avoids the post-await autoplay-policy block.
   * Called after a cache-miss in play() so the next tap is instant.
   */
  private _backgroundResolve(text: string, language: string, cacheKey: string): void {
    // Already inflight — no need to kick off a second request.
    if (this._inflight.has(cacheKey)) return;
    // Fire-and-forget; errors are swallowed since this is best-effort pre-warming.
    this.resolveUrl(text, language).catch(() => undefined);
  }

  /**
   * Like play() but resolves when audio ends.
   * Used by ListenStore for sequential playback.
   *
   * The listen playlist drives playback programmatically (not from a tap), so
   * autoplay policy is less strict — Audio.play() after await is usually fine
   * in an established media session. The real risk here is a hung Promise that
   * blocks the playlist indefinitely when the API is slow or down.
   *
   * Timeout strategy: if resolveUrl() takes longer than RESOLVE_TIMEOUT_MS,
   * fall through to Web Speech immediately. The background resolve continues
   * and the next word in the playlist will benefit from the cache.
   */
  async playAsPromise(text: string, language = 'de-DE'): Promise<void> {
    const RESOLVE_TIMEOUT_MS = 1500;

    const url = await Promise.race([
      this.resolveUrl(text, language),
      new Promise<null>(resolve => setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS)),
    ]);

    if (url) {
      return this._playAndWait(url);
    }

    if (!this._isRateLimited()) {
      const ephemeralUrl = await this._ephemeralTts(text, language);
      if (ephemeralUrl) {
        return this._playAndWait(ephemeralUrl);
      }
    }

    return new Promise(resolve => {
      this.fallback.speak(text, language, 0.85).subscribe({
        next: () => resolve(), error: () => resolve(), complete: () => resolve(),
      });
    });
  }

  /**
   * Returns true if the audio URL for this text is already in the in-memory
   * cache for this session. Used by UI components to show a "ready" indicator
   * without triggering an API call.
   */
  hasCached(text: string, language = 'de-DE'): boolean {
    const cacheKey = this._cacheKey(normalizeForAudio(text, language), language);
    return this._urlMap.has(cacheKey);
  }

  /**
   * Pre-warm: resolve audio URLs for a batch without playing.
   * Call after card creation or import to trigger background generation.
   */
  async preWarm(words: { text: string; language?: string }[]): Promise<void> {
    if (!words.length) return;
    const requests: WordAudioResolveRequest[] = words.map(w => ({
      text: w.text,
      language: w.language ?? 'de-DE',
    }));
    try {
      const response = await this.api.batchResolve(requests);
      for (const r of response.results) {
        if (r.wordAudio.audioUrl) {
          const key = this._cacheKey(r.wordAudio.normalizedText, r.wordAudio.language);
          this._urlMap.set(key, r.wordAudio.audioUrl);
        }
      }
    } catch {
      // Pre-warm failure is non-fatal
    }
  }

  /**
   * Resolve the audio URL for a word.
   * Resolution order: memory → device cache → API → null (fallback)
   */
  async resolveUrl(text: string, language = 'de-DE'): Promise<string | null> {
    const normalized = normalizeForAudio(text, language);
    const cacheKey = this._cacheKey(normalized, language);

    // 1. In-memory
    if (this._urlMap.has(cacheKey)) return this._urlMap.get(cacheKey)!;

    // 2. Device cache (native only)
    const deviceCached = await this.cache.getFromCache(cacheKey);
    if (deviceCached) {
      this._urlMap.set(cacheKey, deviceCached);
      return deviceCached;
    }

    // 3. Rate limit
    if (Date.now() < this._rateLimitedUntil) return null;

    // 4. Deduplicate inflight
    if (this._inflight.has(cacheKey)) return this._inflight.get(cacheKey)!;

    const request = this._fetchAndCache(text, language, normalized, cacheKey)
      .finally(() => this._inflight.delete(cacheKey));
    this._inflight.set(cacheKey, request);
    return request;
  }

  private async _fetchAndCache(
    text: string,
    language: string,
    _normalized: string,
    cacheKey: string,
  ): Promise<string | null> {
    this._loadingKeys.update(s => { s.add(cacheKey); return new Set(s); });
    try {
      const result = await this.api.resolve(text, language);

      // Backend signals rate limit via retryAfterMs in the 200 body
      if (result.retryAfterMs) {
        this._rateLimitedUntil = Date.now() + result.retryAfterMs;
      }

      const audioUrl = result.wordAudio.audioUrl;
      if (!audioUrl) return null;

      this._urlMap.set(cacheKey, audioUrl);

      // Download to device for offline use (no-op on web)
      const localUrl = await this.cache.getOrDownload(cacheKey, audioUrl);
      if (localUrl && localUrl !== audioUrl) {
        this._urlMap.set(cacheKey, localUrl);
        return localUrl;
      }

      return audioUrl;
    } catch (err: any) {
      // Unexpected HTTP error (network failure, 5xx, etc.)
      if (err?.status === 429) {
        const headerSecs = err?.headers?.get?.('Retry-After');
        const bodyMs = err?.error?.retryAfterMs;
        const retryAfterMs = headerSecs != null
          ? parseInt(String(headerSecs), 10) * 1000
          : (typeof bodyMs === 'number' ? bodyMs : 30_000);
        this._rateLimitedUntil = Date.now() + retryAfterMs;
      }
      return null;
    } finally {
      this._loadingKeys.update(s => { s.delete(cacheKey); return new Set(s); });
    }
  }

  private _isRateLimited(): boolean {
    return Date.now() < this._rateLimitedUntil;
  }

  /** Calls /ai/tts for a one-shot object URL. Returns null if the call fails.
   *  Propagates 429 responses into the shared rate-limit clock so subsequent
   *  resolve() calls are also gated — both paths share the same Gemini quota.
   */
  private async _ephemeralTts(text: string, language: string): Promise<string | null> {
    try {
      const speech = await this.gemini.generateSpeech({ text, language });
      return URL.createObjectURL(new Blob([speech.audioBuffer], { type: 'audio/wav' }));
    } catch (err: any) {
      if (err?.status === 429) {
        const headerSecs = err?.headers?.get?.('Retry-After');
        const bodyMs = err?.error?.retryAfterMs;
        const retryAfterMs = headerSecs != null
          ? parseInt(String(headerSecs), 10) * 1000
          : (typeof bodyMs === 'number' ? bodyMs : 30_000);
        this._rateLimitedUntil = Date.now() + retryAfterMs;
      }
      return null;
    }
  }

  private _playAndWait(url: string): Promise<void> {
    return new Promise(resolve => {
      const audio = new Audio(url);
      const cleanup = () => {
        // Revoke ephemeral blob URLs immediately after playback to prevent memory leaks.
        // Persistent R2 URLs (https://...) are not affected.
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        resolve();
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      audio.play().catch(cleanup);
    });
  }

  private _cacheKey(normalizedText: string, language: string): string {
    return `wa-${language}-${normalizedText}`;
  }
}
