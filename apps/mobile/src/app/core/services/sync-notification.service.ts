import { effect, Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { SyncService } from './sync.service';
import { LocalDataService } from './local-data.service';
import { AuthService } from './auth.service';
import type { SyncStatus } from '@lingua-card/shared/domain';
import type { SyncResult } from './sync.service';

@Injectable({ providedIn: 'root' })
export class SyncNotificationService {
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
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
      await this.showToast(this.translate.instant('sync.notifications.recovered'), 'success', 3000);
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
        this.translate.instant('sync.notifications.changesSynced', { count: result.flushedCount }),
        'success',
        2500
      );
      return;
    }

    // First-ever sync
    if (current === 'synced' && result && this.previousStatus === 'syncing') {
      void this.isFirstSync().then(async (first) => {
        if (first) await this.showToast(this.translate.instant('sync.notifications.upToDate'), 'success', 2500);
      });
    }

    // Partial failure
    if (current === 'synced' && result && result.failedFeatures.length > 0) {
      await this.showToast(this.translate.instant('sync.notifications.partialFailure'), 'warning', 4000);
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
      message: this.translate.instant('sync.notifications.failed'),
      color: 'danger',
      position: 'bottom',
      buttons: [
        {
          text: this.translate.instant('sync.notifications.retryNow'),
          handler: () => { void this.syncService.forceSync(); },
        },
        { text: this.translate.instant('common.dismiss'), role: 'cancel' },
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
