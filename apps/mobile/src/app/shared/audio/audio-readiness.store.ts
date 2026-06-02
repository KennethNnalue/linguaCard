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

  /** Returns the status for a single key as a reactive computed signal. */
  getStatus(cacheKey: string): ReturnType<typeof computed<AudioReadinessStatus | 'unknown'>> {
    return computed(() => this._readiness().get(cacheKey) ?? 'unknown');
  }

  /** Reactive count of keys that are 'ready'. */
  readyCount(cacheKeys: string[]): ReturnType<typeof computed<number>> {
    return computed(() => {
      const map = this._readiness();
      return cacheKeys.filter(k => map.get(k) === 'ready').length;
    });
  }

  /** True when every supplied key is 'ready' or 'failed' (none still pending). */
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
