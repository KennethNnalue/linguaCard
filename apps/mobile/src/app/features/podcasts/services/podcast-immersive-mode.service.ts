import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Capacitor, SystemBars } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export type PodcastImmersiveModeState =
  | 'standard'
  | 'entering'
  | 'immersive'
  | 'exiting'
  | 'unavailable';

export type PodcastImmersiveFailureReason = 'fullscreen' | 'orientation';

export interface PodcastImmersivePlatform {
  isNativePlatform(): boolean;
  lockLandscape(): Promise<void>;
  lockPortrait(): Promise<void>;
  unlockOrientation(): Promise<void>;
  hideSystemBars(): Promise<void>;
  showSystemBars(): Promise<void>;
}

export const PODCAST_IMMERSIVE_PLATFORM = new InjectionToken<PodcastImmersivePlatform>(
  'PODCAST_IMMERSIVE_PLATFORM',
  {
    factory: () => ({
      isNativePlatform: () => Capacitor.isNativePlatform(),
      lockLandscape: () => ScreenOrientation.lock({ orientation: 'landscape' }),
      lockPortrait: () => ScreenOrientation.lock({ orientation: 'portrait' }),
      unlockOrientation: () => ScreenOrientation.unlock(),
      hideSystemBars: () => SystemBars.hide(),
      showSystemBars: () => SystemBars.show(),
    }),
  },
);

@Injectable()
export class PodcastImmersiveModeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platform = inject(PODCAST_IMMERSIVE_PLATFORM);
  private readonly modeState = signal<PodcastImmersiveModeState>('standard');
  private readonly landscape = signal(false);
  private readonly failure = signal<PodcastImmersiveFailureReason | null>(null);
  private readonly landscapeQuery: MediaQueryList | null;
  private transition = Promise.resolve();
  private nativeSystemBarsHidden = false;
  private nativeOrientationManaged = false;
  private nativePortraitRestoreRequested = false;
  private webFullscreenRequested = false;
  private webOrientationLocked = false;
  private destroyed = false;

  readonly state = this.modeState.asReadonly();
  readonly isLandscape = this.landscape.asReadonly();
  readonly failureReason = this.failure.asReadonly();
  readonly isImmersive = computed(() => this.modeState() === 'immersive');
  readonly isTransitioning = computed(() => (
    this.modeState() === 'entering' || this.modeState() === 'exiting'
  ));

  constructor() {
    this.landscapeQuery = this.document.defaultView?.matchMedia('(orientation: landscape)') ?? null;
    this.landscape.set(this.landscapeQuery?.matches ?? false);
    this.landscapeQuery?.addEventListener('change', this.handleOrientationChange);
    this.document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    this.document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.landscapeQuery?.removeEventListener('change', this.handleOrientationChange);
      this.document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
      this.document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      void this.enqueue(() => this.restoreExternalUi());
    });
  }

  enter(host: HTMLElement): Promise<void> {
    return this.enqueue(async () => {
      if (this.destroyed || this.modeState() === 'immersive') return;

      this.modeState.set('entering');
      this.failure.set(null);

      if (this.platform.isNativePlatform()) {
        await this.enterNative();
        return;
      }

      await this.enterWeb(host);
    });
  }

  exit(): Promise<void> {
    return this.enqueue(() => this.exitCurrentMode());
  }

  restorePortrait(): Promise<void> {
    return this.enqueue(() => this.exitCurrentMode());
  }

  private readonly handleOrientationChange = (event: MediaQueryListEvent): void => {
    this.landscape.set(event.matches);
    if (event.matches) this.nativePortraitRestoreRequested = false;
  };

  private readonly handleFullscreenChange = (): void => {
    if (this.platform.isNativePlatform()) return;
    if (!this.webFullscreenRequested || this.document.fullscreenElement) return;

    this.webFullscreenRequested = false;
    void this.enqueue(async () => {
      await this.unlockWebOrientation();
      this.failure.set(null);
      this.modeState.set('standard');
    });
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.document.visibilityState !== 'visible') return;
    if (this.modeState() !== 'immersive' || this.landscape()) return;
    void this.enqueue(() => this.exitCurrentMode());
  };

  private async enterNative(): Promise<void> {
    this.nativePortraitRestoreRequested = false;
    try {
      await this.platform.hideSystemBars();
      this.nativeSystemBarsHidden = true;
    } catch {
      this.nativeSystemBarsHidden = false;
    }

    try {
      await this.platform.lockLandscape();
      this.nativeOrientationManaged = true;
      this.modeState.set('immersive');
    } catch {
      if (this.nativeSystemBarsHidden) await this.showSystemBarsSafely();
      this.failure.set('orientation');
      this.modeState.set('unavailable');
    }
  }

  private async enterWeb(host: HTMLElement): Promise<void> {
    if (!this.document.fullscreenEnabled || typeof host.requestFullscreen !== 'function') {
      this.failure.set('fullscreen');
      this.modeState.set('unavailable');
      return;
    }

    try {
      await host.requestFullscreen();
      this.webFullscreenRequested = true;
    } catch {
      this.failure.set('fullscreen');
      this.modeState.set('unavailable');
      return;
    }

    try {
      await this.platform.lockLandscape();
      this.webOrientationLocked = true;
    } catch {
      this.failure.set('orientation');
    }

    this.modeState.set('immersive');
  }

  private async exitCurrentMode(): Promise<void> {
    const shouldRestoreNativeUi = this.platform.isNativePlatform() && (
      this.nativeOrientationManaged
      || this.nativeSystemBarsHidden
      || (this.landscape() && !this.nativePortraitRestoreRequested)
    );
    const shouldRestoreWebUi = this.webFullscreenRequested || this.webOrientationLocked;
    if (!shouldRestoreNativeUi && !shouldRestoreWebUi && this.modeState() === 'standard') return;

    this.modeState.set('exiting');
    await this.restoreExternalUi();
    this.failure.set(null);
    this.modeState.set('standard');
  }

  private async restoreExternalUi(): Promise<void> {
    if (this.platform.isNativePlatform()) {
      await Promise.allSettled([
        this.restoreNativeOrientation(),
        this.restoreNativeSystemBars(),
      ]);
      return;
    }

    await this.unlockWebOrientation();
    if (this.webFullscreenRequested && typeof this.document.exitFullscreen === 'function') {
      await this.document.exitFullscreen().catch(() => undefined);
    }
    this.webFullscreenRequested = false;
  }

  private async unlockWebOrientation(): Promise<void> {
    if (!this.webOrientationLocked) return;
    await this.platform.unlockOrientation().catch(() => undefined);
    this.webOrientationLocked = false;
  }

  private async showSystemBarsSafely(): Promise<void> {
    await this.restoreNativeSystemBars();
  }

  private async restoreNativeOrientation(): Promise<void> {
    if (!this.nativeOrientationManaged
      && (!this.landscape() || this.nativePortraitRestoreRequested)) return;
    try {
      await this.platform.lockPortrait();
      this.nativeOrientationManaged = false;
      this.nativePortraitRestoreRequested = true;
    } catch {
      // A later cleanup call can retry the restoration.
    }
  }

  private async restoreNativeSystemBars(): Promise<void> {
    if (!this.nativeSystemBarsHidden) return;
    try {
      await this.platform.showSystemBars();
      this.nativeSystemBarsHidden = false;
    } catch {
      // A later cleanup call can retry the restoration.
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const nextTransition = this.transition.then(operation);
    this.transition = nextTransition.catch(() => undefined);
    return nextTransition;
  }
}
