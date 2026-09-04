import { Injectable, computed, inject, signal } from '@angular/core';
import { type Card, type WordAudioResolveRequest } from '@lingua-card/shared/domain';
import { AiAudioCacheService } from '../../features/ai/audio/ai-audio-cache.service';
import { WordAudioApiService } from './word-audio-api.service';
import { AudioReadinessStore, AudioReadinessStatus } from './audio-readiness.store';
import { normalizeForAudio } from './normalize';

export interface AudioPreWarmResult {
  requestedCount: number;
  availableCount: number;
  savedOfflineCount: number;
}

@Injectable({ providedIn: 'root' })
export class WordAudioService {
  private readonly api = inject(WordAudioApiService);
  private readonly cache = inject(AiAudioCacheService);
  private readonly audioReadiness = inject(AudioReadinessStore);

  // Tracks which cache keys are actively being fetched from the API.
  // isLoading is true when any word is in-flight, without one word's finish
  // incorrectly clearing the flag while others are still loading.
  private readonly _loadingKeys = signal(new Set<string>());
  readonly isLoading = computed(() => this._loadingKeys().size > 0);
  private readonly _isPlaying = signal(false);
  readonly isPlaying = this._isPlaying.asReadonly();
  private readonly _playbackError = signal(false);
  readonly playbackError = this._playbackError.asReadonly();

  // In-memory: cacheKey → audioUrl. Populated from API responses and device cache.
  private readonly _urlMap = new Map<string, string>();

  // Deduplicates concurrent requests for the same word.
  private readonly _inflight = new Map<string, Promise<string | null>>();

  // Stop making API calls until this timestamp passes (set on 429/503).
  private _rateLimitedUntil = 0;

  // Monotonic tap counter. Each tap-driven play() takes a sequence number; a
  // newer tap or a stop() bumps it so a still-resolving older tap abandons its
  // play() instead of firing late. Also lets stop() cancel a pending resolve.
  private _tapSeq = 0;

  // Lazily-created silent WAV blob URL used to unlock the shared player.
  private _silentUrl: string | null = null;

  // ── Single shared <audio> element ───────────────────────────────────────────
  // ONE long-lived element drives ALL word/example pronunciation — tap-to-play
  // (vault, review, stories keywords) AND the Listen playlist. Reusing one
  // element (instead of `new Audio()` per play) is what makes post-`await`
  // playback survive the autoplay policy on iOS/Chrome PWAs: the element is
  // "unlocked" once inside the first user gesture (a silent clip), after which
  // every later `src = …; play()` on the SAME element is permitted — even when
  // driven programmatically by the playlist sequencer. Story narration is a
  // separate concern (full-file playback w/ timestamps) handled by StoryAudioEngine.
  private _player: HTMLAudioElement | null = null;
  private _unlocked = false;

  constructor() {
    // Unlock the shared element on the very first user interaction anywhere in
    // the app, while we are still inside the gesture. By the time the user taps a
    // word or presses ▶ in Listen, the element is already primed for autoplay.
    const unlockOnce = () => {
      this._unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
  }

  /**
   * Play AI pronunciation for a card's word.
   * Builds text from article + back, then resolves via the word audio registry.
   */
  async playCard(card: Card, language = 'de-DE'): Promise<void> {
    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    await this.play(text, language);
  }

  /**
   * Play HD pronunciation for arbitrary text (tap-to-play).
   * Resolved by normalized text — same audio for "der Hund", "Der Hund", "der Hund."
   *
   * HD-only policy: we never play the robotic Web Speech voice. Users found it
   * jarring — and the old "fallback now, HD next tap" behaviour meant the first
   * tap played browser audio and a second tap was needed to hear HD.
   *
   * - Memory-cache hit → play the shared element immediately.
   * - Cache miss → resolve the HD asset, then play it on the shared element.
   *   Audio.play() after an `await` would normally be blocked by autoplay policy
   *   on iOS/Chrome PWAs, but the shared element is unlocked on first gesture
   *   (see constructor), so the post-await play() is permitted.
   *
   * If the HD asset genuinely cannot be resolved (offline, backend error), we stay
   * silent rather than falling back to the browser voice. The `isLoading` signal is
   * raised during resolution so callers can show a spinner.
   */
  async play(text: string, language = 'de-DE'): Promise<void> {
    const cacheKey = this._cacheKey(normalizeForAudio(text, language), language);
    const cached = this._urlMap.get(cacheKey);

    if (cached) {
      void this._playUrl(cached, 1);
      return;
    }

    // Cache miss: resolve HD, then play (shared element is already unlocked).
    const seq = ++this._tapSeq;
    const url = await this.resolveUrl(text, language);

    // A newer tap or a stop() superseded this one while resolving — abandon it.
    if (seq !== this._tapSeq) return;
    // HD genuinely unavailable — stay silent (no browser fallback by design).
    if (!url) {
      this._playbackError.set(true);
      return;
    }

    void this._playUrl(url, 1);
  }

  /** Lazily create the single shared <audio> element. */
  private _ensurePlayer(): HTMLAudioElement {
    if (!this._player) {
      this._player = new Audio();
      this._player.preload = 'auto';
    }
    return this._player;
  }

  /**
   * Unlock the shared element for autoplay by playing a silent clip inside a user
   * gesture. Idempotent — safe to call on every gesture; only the first matters.
   */
  private _unlock(): void {
    if (this._unlocked) return;
    this._unlocked = true;
    const player = this._ensurePlayer();
    player.src = this._silentClipUrl();
    // Play the ~0.1s silent clip to completion — do NOT chain a pause(), which
    // could fire after a real play() started in the same gesture and silence it.
    // A real play() simply reassigns src and interrupts the silent clip.
    player.play().catch(() => undefined);
  }

  /**
   * Play a resolved URL on the shared element, resolving when it ends (or errors,
   * or is stopped). Sequential by design — one word plays at a time across the
   * whole app — so reusing a single element is safe and avoids the per-element
   * autoplay unlock that `new Audio()` would require on iOS.
   */
  private _playUrl(url: string, rate: number): Promise<void> {
    this.stop();
    return new Promise(resolve => {
      const player = this._ensurePlayer();
      this._playbackError.set(false);
      this._isPlaying.set(true);
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        player.removeEventListener('ended', cleanup);
        player.removeEventListener('error', fail);
        player.removeEventListener('lc-stop', cleanup);
        this._isPlaying.set(false);
        resolve();
      };
      const fail = () => {
        this._playbackError.set(true);
        cleanup();
      };
      player.addEventListener('ended', cleanup, { once: true });
      player.addEventListener('error', fail, { once: true });
      // 'lc-stop' is dispatched by stop() so the promise resolves immediately
      // instead of hanging (pause() fires no standard event).
      player.addEventListener('lc-stop', cleanup, { once: true });
      player.src = url;
      player.currentTime = 0;
      player.playbackRate = rate;
      player.play().catch(fail);
    });
  }

  /** Lazily build a tiny silent WAV blob URL (0.1s) used to unlock audio elements. */
  private _silentClipUrl(): string {
    if (this._silentUrl) return this._silentUrl;
    const sampleRate = 8000;
    const samples = 800; // ~0.1s
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, 1, true);  // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
    view.setUint16(32, 1, true);  // block align
    view.setUint16(34, 8, true);  // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128); // 8-bit silence
    this._silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    return this._silentUrl;
  }

  /**
   * Like play() but resolves when audio ends — used by the Listen playlist and
   * the story quiz for sequential, HD-only playback.
   *
   * HD-only, no Web Speech: we wait for the resolved HD asset and play it. The
   * playlist pre-warms a sliding window (and gates the very first card), so this
   * is normally an instant memory-cache hit. On a genuine miss it awaits the API
   * (a brief pause) rather than ever speaking the robotic browser voice. If the
   * asset truly cannot be resolved, it resolves silently so the sequence advances.
   *
   * `rate` is the playback speed applied to the element's playbackRate.
   */
  async playTarget(text: string, language = 'de-DE', rate = 1): Promise<void> {
    const url = await this.resolveUrl(text, language);
    if (!url) {
      this._playbackError.set(true);
      return;
    }
    return this._playUrl(url, rate);
  }

  async playRequired(text: string, language: string, rate = 1): Promise<void> {
    const url = await this.resolveUrl(text, language);
    if (!url) {
      this._playbackError.set(true);
      throw new Error('Audio is unavailable for this phrase');
    }
    return this._playUrl(url, rate);
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
  async preWarm(words: { text: string; language?: string }[]): Promise<AudioPreWarmResult> {
    const uniqueRequests = new Map<string, WordAudioResolveRequest>();
    for (const word of words) {
      const language = word.language ?? 'de-DE';
      const normalized = normalizeForAudio(word.text, language);
      uniqueRequests.set(this._cacheKey(normalized, language), {text: word.text, language});
    }
    const requests = [...uniqueRequests.values()];
    const summary: AudioPreWarmResult = {
      requestedCount: requests.length,
      availableCount: 0,
      savedOfflineCount: 0,
    };
    if (!requests.length) return summary;
    try {
      const response = await this.api.batchResolve(requests);
      const available = response.results.filter(result => Boolean(result.wordAudio.audioUrl));
      summary.availableCount = available.length;
      const persisted = await Promise.all(available.map(async result => {
        const key = this._cacheKey(result.wordAudio.normalizedText, result.wordAudio.language);
        const remoteUrl = result.wordAudio.audioUrl;
        if (!remoteUrl) return null;
        const localUrl = await this.cache.saveFromUrl(key, remoteUrl);
        return { key, localUrl, remoteUrl };
      }));
      for (const result of persisted) {
        if (!result) continue;
        if (result.localUrl) summary.savedOfflineCount += 1;
        this._urlMap.set(result.key, result.localUrl ?? result.remoteUrl);
        this.audioReadiness.markReady(result.key);
      }
    } catch {
      // Pre-warm failure is non-fatal
    }
    return summary;
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
    } catch (err: unknown) {
      this.audioReadiness.markFailed(cacheKey);
      const failure = err as {
        status?: number;
        headers?: { get?: (name: string) => string | null };
        error?: { retryAfterMs?: number };
      };
      // Unexpected HTTP error (network failure, 5xx, etc.)
      if (failure.status === 429) {
        const headerSecs = failure.headers?.get?.('Retry-After');
        const bodyMs = failure.error?.retryAfterMs;
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

  /**
   * Immediately stop the shared element. Called by the listen pipeline on
   * next/previous/skip (and by tap navigation) so the current word does not keep
   * playing after the user navigates away. Also cancels any tap-driven play()
   * still waiting on HD resolution via the sequence bump.
   */
  stop(): void {
    this._tapSeq++;
    if (this._player) {
      this._player.pause();
      this._player.currentTime = 0;
      // Dispatch so the cleanup listener inside _playUrl resolves its promise —
      // prevents the playlist's concatMap inner observable from hanging forever.
      this._player.dispatchEvent(new Event('lc-stop'));
    }
    this._isPlaying.set(false);
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
