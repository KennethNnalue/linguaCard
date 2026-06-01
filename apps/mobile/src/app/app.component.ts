import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { ThemeService } from './core/services/theme.service';
import { LocalDataService } from './core/services/local-data.service';
import { SyncService } from './core/services/sync.service';
import { SyncNotificationService } from './core/services/sync-notification.service';
import { NetworkService } from './core/services/network.service';
import { PwaInstallBannerComponent } from './shared/components/pwa-install-banner/pwa-install-banner.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';

@Component({
  selector: 'lc-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, PwaInstallBannerComponent, OfflineBannerComponent],
})
export class AppComponent implements OnInit {
  private readonly themeService = inject(ThemeService);
  private readonly localData = inject(LocalDataService);
  private readonly syncService = inject(SyncService);
  private readonly syncNotification = inject(SyncNotificationService);
  private readonly networkService = inject(NetworkService);

  constructor() {
    this.themeService.initialize();
  }

  async ngOnInit(): Promise<void> {
    await this.localData.init();
    await this.syncService.init();

    const { connected } = await Network.getStatus();
    if (connected) {
      void this.syncService.forceSync();
    }

    this.startBackgroundSync();
  }

  private startBackgroundSync(): void {
    this.syncService.startPeriodicSync();

    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive && navigator.onLine) {
          await this.syncService.forceSync();
        }
      });
    }
  }
}
