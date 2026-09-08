import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

export interface PodcastScreenAwakePlatform {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
}

export const PODCAST_SCREEN_AWAKE_PLATFORM = new InjectionToken<PodcastScreenAwakePlatform>(
  'PODCAST_SCREEN_AWAKE_PLATFORM',
  {
    factory: () => ({
      keepAwake: () => KeepAwake.keepAwake(),
      allowSleep: () => KeepAwake.allowSleep(),
    }),
  },
);

@Injectable()
export class PodcastScreenAwakeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platform = inject(PODCAST_SCREEN_AWAKE_PLATFORM);
  private readonly sleepAllowed = signal(false);
  private transition = Promise.resolve();
  private isPlaying = false;

  readonly isSleepAllowed = this.sleepAllowed.asReadonly();
  readonly isKeepingScreenAwake = computed(() => !this.sleepAllowed());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isPlaying = false;
      void this.enqueue(() => this.platform.allowSleep());
    });
  }

  playbackStarted(): Promise<void> {
    this.isPlaying = true;
    return this.synchronizePreference();
  }

  playbackStopped(): Promise<void> {
    this.isPlaying = false;
    return this.synchronizePreference();
  }

  toggleSleepAllowed(): Promise<void> {
    this.sleepAllowed.update(isAllowed => !isAllowed);
    return this.synchronizePreference();
  }

  private synchronizePreference(): Promise<void> {
    return this.enqueue(async () => {
      if (this.isPlaying && !this.sleepAllowed()) return this.platform.keepAwake();
      return this.platform.allowSleep();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const transition = this.transition.then(operation);
    this.transition = transition.catch(() => undefined);
    return this.transition;
  }
}
