import { Injectable, computed, inject, signal } from '@angular/core';
import { type Card, type WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { AudioService } from './audio.service';
import { WordAudioApiService } from './word-audio-api.service';
import { AudioReadinessStore, AudioReadinessStatus } from './audio-readiness.store';
import { normalizeForAudio } from './normalize';

@Injectable({ providedIn: 'root' })
export class WordAudioService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly fallback = inject(AudioService);
  private readonly audioReadiness = inject(AudioReadinessStore);

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

  // The HTMLAudioElement currently playing via _playAndWait, if any.
  // Kept so stop() can abort it immediately — new Audio() creates an anonymous
  // element with no external cancel handle, so without this reference the
  // audio plays to completion regardless of navigation or skip actions.
  private _activeAudio: HTMLAudioElement | null = null;

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
   *
   * `rate` is the playback speed (1 = normal). It is applied to the
   * HTMLAudioElement's playbackRate for cached audio and to the Web-Speech
   * utterance rate for the fallback path. Defaults to 1 so callers outside the
   * listen playlist (e.g. Stories) are unaffected.
   *
   * Cost note: on a cache miss we fall straight to Web Speech and let the
   * background resolveUrl() persist the HD asset for next time. We deliberately
   * do NOT generate a throwaway one-shot clip here — that double-paid for audio
   * that was never cached.
   */
  async playAsPromise(text: string, language = 'de-DE', rate = 1): Promise<void> {
    // Short timeout: windowed prefetch means the word is usually already a
    // memory-cache hit (resolves instantly). On a genuine miss, fall back to
    // Web Speech quickly rather than stalling the playlist.
    const RESOLVE_TIMEOUT_MS = 700;

    const url = await Promise.race([
      this.resolveUrl(text, language),
      new Promise<null>(resolve => setTimeout(() => resolve(null), RESOLVE_TIMEOUT_MS)),
    ]);

    if (url) {
      return this._playAndWait(url, false, rate);
    }

    // Miss → instant Web Speech. resolveUrl() keeps running in the background
    // (deduplicated via _inflight) so the HD asset is ready next time.
    return this._speakFallback(text, language, rate);
  }

  /**
   * Native-language audio policy for the listen playlist.
   *
   * Today: browser Web Speech — free, instant, offline, and works for any
   * native language without per-language TTS voices. The product value is
   * hearing the *target* language; the translation is secondary.
   *
   * Future (cost/quality option 2): route single native words (not sentences)
   * through the cached HD pipeline here — the call site does not change.
   */
  playNative(text: string, language = 'en-US', rate = 1): Promise<void> {
    return this._speakFallback(text, language, rate);
  }

  /** Speak via the Web Speech fallback, resolving when it ends (or errors). */
  private _speakFallback(text: string, language: string, rate: number): Promise<void> {
    return new Promise(resolve => {
      this.fallback.speak(text, language, rate).subscribe({
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
   * Readiness of the HD asset for a word, for UI hints (e.g. queue "HD ready"
   * dots). 'ready' once the asset is cached, 'pending' while resolving, 'failed',
   * or 'unknown'. Reactive: reads the AudioReadinessStore signal, so callers can
   * wrap it in a computed() and it re-evaluates as words become ready.
   */
  readinessFor(text: string, language = 'de-DE'): AudioReadinessStatus | 'unknown' {
    const cacheKey = this._cacheKey(normalizeForAudio(text, language), language);
    const status = this.audioReadiness.statusFor(cacheKey);
    if (status !== 'unknown') return status;
    return this._urlMap.has(cacheKey) ? 'ready' : 'unknown';
  }

  /**
   * Pre-warm: resolve audio URLs for a batch without playing.
   * Populates in-memory cache AND downloads to device filesystem so audio
   * survives app restarts without a network round-trip.
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
        if (!r.wordAudio.audioUrl) continue;
        const key      = this._cacheKey(r.wordAudio.normalizedText, r.wordAudio.language);
        const remoteUrl = r.wordAudio.audioUrl;

        // Download to device filesystem (no-op on web, idempotent if already cached).
        const localUrl = await this.cache.saveFromUrl(key, remoteUrl);
        const resolvedUrl = localUrl ?? remoteUrl;

        this._urlMap.set(key, resolvedUrl);
        this.audioReadiness.markReady(key);
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
      this.audioReadiness.markReady(cacheKey);
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
    this.audioReadiness.markPending(cacheKey);
    try {
      const result = await this.api.resolve(text, language);

      // Backend signals rate limit via retryAfterMs in the 200 body
      if (result.retryAfterMs) {
        this._rateLimitedUntil = Date.now() + result.retryAfterMs;
      }

      const audioUrl = result.wordAudio.audioUrl;
      if (!audioUrl) {
        this.audioReadiness.markFailed(cacheKey);
        return null;
      }

      this._urlMap.set(cacheKey, audioUrl);

      // Download to device for offline use (no-op on web).
      // Use saveFromUrl so subsequent sessions hit Capacitor Filesystem immediately.
      const localUrl = await this.cache.saveFromUrl(cacheKey, audioUrl);
      if (localUrl && localUrl !== audioUrl) {
        this._urlMap.set(cacheKey, localUrl);
        this.audioReadiness.markReady(cacheKey);
        return localUrl;
      }

      this.audioReadiness.markReady(cacheKey);
      return audioUrl;
    } catch (err: any) {
      this.audioReadiness.markFailed(cacheKey);
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

  private _playAndWait(url: string, ephemeral = false, rate = 1): Promise<void> {
    return new Promise(resolve => {
      const audio = new Audio(url);
      audio.playbackRate = rate;
      this._activeAudio = audio;

      const cleanup = () => {
        // Only clear the reference if it still points to this element —
        // stop() may have already nulled it and started a new word.
        if (this._activeAudio === audio) this._activeAudio = null;
        // Only revoke truly ephemeral blob URLs (one-shot TTS, never stored in
        // _urlMap). Persistent blobs from the IndexedDB web cache must stay alive
        // for the entire session — revoking them causes net::ERR_FILE_NOT_FOUND
        // when previous() replays a card that already played once this session.
        if (ephemeral && url.startsWith('blob:')) URL.revokeObjectURL(url);
        resolve();
      };

      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      // 'lc-stop' is dispatched by stop() below so the promise resolves immediately
      // instead of hanging forever (pause() fires no standard events).
      audio.addEventListener('lc-stop', cleanup, { once: true });
      audio.play().catch(cleanup);
    });
  }

  /**
   * Immediately stop all in-flight audio: the active HTMLAudioElement (if any)
   * and the Web Speech fallback. Called by the listen pipeline on next/previous/skip
   * so the current word does not keep playing after the user navigates away.
   */
  stop(): void {
    if (this._activeAudio) {
      const audio = this._activeAudio;
      this._activeAudio = null;
      audio.pause();
      audio.currentTime = 0;
      // Dispatch before nulling so the cleanup listener inside _playAndWait resolves
      // the promise — prevents the concatMap inner observable from hanging forever.
      audio.dispatchEvent(new Event('lc-stop'));
    }
    this.fallback.stop();
  }

  /**
   * Write a batch of already-resolved audio URLs into the in-memory cache.
   * Called by CollectionAudioPrefetchService after a successful batchResolve
   * so the first play() after prefetch is an instant memory-cache hit instead
   * of falling back to Web Speech.
   */
  populateMemoryCache(entries: { normalizedText: string; language: string; url: string }[]): void {
    for (const e of entries) {
      const key = this._cacheKey(e.normalizedText, e.language);
      this._urlMap.set(key, e.url);
      this.audioReadiness.markReady(key);
    }
  }

  private _cacheKey(normalizedText: string, language: string): string {
    return `wa-${language}-${normalizedText}`;
  }
}
