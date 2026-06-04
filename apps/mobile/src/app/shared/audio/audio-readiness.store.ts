import { computed, Injectable, signal } from '@angular/core';

export type AudioReadinessStatus = 'pending' | 'ready' | 'failed';

@Injectable({ providedIn: 'root' })
export class AudioReadinessStore {
  private readonly _readiness = signal(new Map<string, AudioReadinessStatus>());

  markPending(cacheKey: string): void {
    this._readiness.update(m => new Map(m).set(cacheKey, 'pending'));
  }

  markReady(cacheKey: string): void {
    this._readiness.update(m => new Map(m).set(cacheKey, 'ready'));
  }

  markFailed(cacheKey: string): void {
    this._readiness.update(m => new Map(m).set(cacheKey, 'failed'));
  }

  /**
   * Inline status read — safe to call inside a computed() or template expression.
   * Reads the map signal directly; does NOT allocate a new computed on each call.
   */
  statusFor(cacheKey: string): AudioReadinessStatus | 'unknown' {
    return this._readiness().get(cacheKey) ?? 'unknown';
  }

  /**
   * Returns the status for a single key as a reactive computed signal.
   * @deprecated Use statusFor() inside your own computed() instead — calling this
   * inside a computed() allocates a new inner computed on every evaluation and
   * causes infinite re-evaluation loops.
   */
  getStatus(cacheKey: string): ReturnType<typeof computed<AudioReadinessStatus | 'unknown'>> {
    return computed(() => this._readiness().get(cacheKey) ?? 'unknown');
  }

  /**
   * Inline ready-count read — safe to call inside a computed() or template expression.
   * Does NOT allocate a new computed on each call.
   */
  readyCountFor(cacheKeys: string[]): number {
    const map = this._readiness();
    return cacheKeys.filter(k => map.get(k) === 'ready').length;
  }

  /**
   * Inline all-settled read — safe to call inside a computed() or template expression.
   * Does NOT allocate a new computed on each call.
   */
  allSettledFor(cacheKeys: string[]): boolean {
    if (!cacheKeys.length) return true;
    const map = this._readiness();
    return cacheKeys.every(k => { const s = map.get(k); return s === 'ready' || s === 'failed'; });
  }

  /**
   * @deprecated Use readyCountFor() inside your own computed() instead.
   */
  readyCount(cacheKeys: string[]): ReturnType<typeof computed<number>> {
    return computed(() => {
      const map = this._readiness();
      return cacheKeys.filter(k => map.get(k) === 'ready').length;
    });
  }

  /**
   * @deprecated Use allSettledFor() inside your own computed() instead.
   */
  allSettled(cacheKeys: string[]): ReturnType<typeof computed<boolean>> {
    return computed(() => {
      if (!cacheKeys.length) return true;
      const map = this._readiness();
      return cacheKeys.every(k => {
        const s = map.get(k);
        return s === 'ready' || s === 'failed';
      });
    });
  }

  /** True when every key is 'ready'. */
  allReady(cacheKeys: string[]): ReturnType<typeof computed<boolean>> {
    return computed(() => {
      if (!cacheKeys.length) return false;
      const map = this._readiness();
      return cacheKeys.every(k => map.get(k) === 'ready');
    });
  }
}
