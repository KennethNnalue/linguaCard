import { Component, computed, EnvironmentInjector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {NavigationEnd, Router} from '@angular/router';
import {IonBadge, IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs} from '@ionic/angular/standalone';
import {TranslatePipe} from '@ngx-translate/core';
import {ShareStore} from '../features/sharing/store/share.store';
import {addIcons} from 'ionicons';
import {
  analyticsOutline,
  bookOutline,
  folderOpenOutline,
  homeOutline,
  playCircleOutline,
  volumeHighOutline
} from 'ionicons/icons';

// Routes where the tab bar should be hidden (player / complete screens)
const HIDE_TAB_BAR_ROUTES = [
  '/listen',
  '/listen/now-playing',
  '/listen/complete',
];

@Component({
  selector: 'lc-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge, TranslatePipe],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  readonly shareStore = inject(ShareStore);

  private readonly currentUrl = signal(this.router.url);
  readonly hideTabBar = computed(() =>
    HIDE_TAB_BAR_ROUTES.some(r => this.currentUrl().startsWith(r))
  );

  constructor() {
    addIcons({analyticsOutline, bookOutline, volumeHighOutline, playCircleOutline, folderOpenOutline, homeOutline});

    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
  }
}
