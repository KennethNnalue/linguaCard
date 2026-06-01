import { effect, Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { SyncService } from './sync.service';
import { LocalDataService } from './local-data.service';
import { AuthService } from './auth.service';
import type { SyncStatus } from '@lingua-card/shared/domain';
import type { SyncResult } from './sync.service';

@Injectable({ providedIn: 'root' })
export class SyncNotificationService {
  private readonly toastCtrl = inject(ToastController);
  private readonly syncService = inject(SyncService);
  private readonly localData = inject(LocalDataService);
  private readonly authService = inject(AuthService);

  private previousStatus: SyncStatus = 'synced';
  private activeErrorToast: HTMLIonToastElement | null = null;

  constructor() {
    effect(() => {
      const current = this.syncService.syncStatus();
      const result = this.syncService.lastSyncResult();
      void this.evaluateAndNotify(current, result);
      this.previousStatus = current;
    });
  }

  private async evaluateAndNotify(
    current: SyncStatus,
    result: SyncResult | null
  ): Promise<void> {
    // Recovered from error state
    if (current === 'synced' && this.previousStatus === 'error') {
      await this.dismissErrorToast();
      await this.showToast('Sync recovered — data is up to date', 'success', 3000);
      return;
    }

    // New error state
    if (current === 'error' && this.previousStatus !== 'error') {
      await this.showPersistentErrorBanner();
      return;
    }

    // Successful flush of queued operations
    if (current === 'synced' && result && result.flushedCount > 0) {
      await this.showToast(
        `${result.flushedCount} queued change${result.flushedCount > 1 ? 's' : ''} synced`,
        'success',
        2500
      );
      return;
    }

    // First-ever sync
    if (current === 'synced' && result && this.previousStatus === 'syncing') {
      void this.isFirstSync().then(async (first) => {
        if (first) await this.showToast('Everything is up to date', 'success', 2500);
      });
    }

    // Partial failure
    if (current === 'synced' && result && result.failedFeatures.length > 0) {
      await this.showToast("Some data couldn't sync. Will retry.", 'warning', 4000);
    }
  }

  private async isFirstSync(): Promise<boolean> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return false;
    const [s, c, col] = await Promise.all([
      this.localData.getLastSyncedAt('stories'),
      this.localData.getLastSyncedAt('cards'),
      this.localData.getLastSyncedAt('collections'),
    ]);
    return s === null && c === null && col === null;
  }

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger',
    duration: number
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      color,
      position: 'bottom',
      positionAnchor: 'footer',
    });
    await toast.present();
  }

  private async showPersistentErrorBanner(): Promise<void> {
    await this.dismissErrorToast();
    this.activeErrorToast = await this.toastCtrl.create({
      message: 'Sync failed — will retry automatically',
      color: 'danger',
      position: 'bottom',
      buttons: [
        {
          text: 'Retry now',
          handler: () => { void this.syncService.forceSync(); },
        },
        { text: 'Dismiss', role: 'cancel' },
      ],
    });
    await this.activeErrorToast.present();
  }

  private async dismissErrorToast(): Promise<void> {
    if (this.activeErrorToast) {
      await this.activeErrorToast.dismiss();
      this.activeErrorToast = null;
    }
  }
}
