import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Network } from '@capacitor/network';
import { ThemeService } from './core/services/theme.service';
import { LocalDataService } from './core/services/local-data.service';
import { SyncService } from './core/services/sync.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private readonly themeService = inject(ThemeService);
  private readonly localData = inject(LocalDataService);
  private readonly syncService = inject(SyncService);

  constructor() {
    this.themeService.initialize();
  }

  async ngOnInit(): Promise<void> {
    // 1. Boot local storage (IndexedDB / SQLite)
    await this.localData.init();

    // 2. Restore sync queue and start network listener
    await this.syncService.init();

    // 3. Pull latest from server in the background when online
    const { connected } = await Network.getStatus();
    if (connected) {
      void this.syncService.forceSync();
    }
  }
}
