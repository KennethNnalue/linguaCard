import { ApplicationRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, fromEvent, interval, merge } from 'rxjs';
import { filter, first, map } from 'rxjs/operators';

/**
 * Keeps the PWA on the latest deployed build.
 *
 * ngsw downloads new versions in the background but, by default, will not
 * activate them while any tab is still running the old version — installed
 * PWAs rarely close, so users get stuck on stale code. This service:
 *   1. Polls for updates on the events that matter (foreground, online, timer).
 *   2. Surfaces a "ready" signal the UI can prompt against.
 *   3. Activates the new version and reloads on demand (or on next foreground).
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  /** True once a new version is downloaded and ready to activate. */
  readonly updateAvailable = signal(false);

  /** How often to poll for a new build while the app is open. */
  private readonly CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

  initialize(): void {
    // Disabled in dev / on browsers without SW support — nothing to do.
    if (!this.swUpdate.isEnabled) {
      return;
    }

    // A new version finished downloading and is staged for activation.
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateAvailable.set(true));

    // ngsw fell into a broken state (e.g. cached files missing) — the only
    // safe recovery is a hard reload to fetch a clean app shell.
    this.swUpdate.unrecoverable.subscribe(() => {
      document.location.reload();
    });

    this.scheduleUpdateChecks();
  }

  /** Activate the staged version and reload into it. */
  async activateUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      // Reload even if activateUpdate() reports no-op — we want the fresh shell.
      document.location.reload();
    }
  }

  private scheduleUpdateChecks(): void {
    // Only start polling once the app is stable, otherwise the initial burst of
    // pending tasks never settles and checks fight with bootstrap.
    const appStable$ = this.appRef.isStable.pipe(first((stable) => stable));

    // Re-check whenever the user comes back to the tab, the network returns,
    // or the long-poll timer fires — whichever happens first, repeatedly.
    const foreground$ = fromEvent(document, 'visibilitychange').pipe(
      filter(() => document.visibilityState === 'visible'),
    );
    const online$ = fromEvent(window, 'online');
    const timer$ = interval(this.CHECK_INTERVAL_MS).pipe(map(() => undefined));

    concat(appStable$, merge(foreground$, online$, timer$)).subscribe(() => {
      void this.checkForUpdate();
    });
  }

  private async checkForUpdate(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      // Network blips are expected; the next trigger will retry.
    }
  }
}
