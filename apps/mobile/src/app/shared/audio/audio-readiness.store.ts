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

  statusFor(cacheKey: string): AudioReadinessStatus | 'unknown' {
    return this._readiness().get(cacheKey) ?? 'unknown';
  }

  readyCountFor(cacheKeys: string[]): number {
    const map = this._readiness();
    return cacheKeys.filter(k => map.get(k) === 'ready').length;
  }

  allSettledFor(cacheKeys: string[]): boolean {
    if (!cacheKeys.length) return true;
    const map = this._readiness();
    return cacheKeys.every(k => { const s = map.get(k); return s === 'ready' || s === 'failed'; });
  }

  allReady(cacheKeys: string[]): ReturnType<typeof computed<boolean>> {
    return computed(() => {
      if (!cacheKeys.length) return false;
      const map = this._readiness();
      return cacheKeys.every(k => map.get(k) === 'ready');
    });
  }
}
