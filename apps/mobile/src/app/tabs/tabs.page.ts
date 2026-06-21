import { Component, computed, EnvironmentInjector, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  bookOutline,
  folderOpenOutline,
  homeOutline,
  playCircleOutline,
  tvOutline,
  volumeHighOutline
} from 'ionicons/icons';
import { ReviewRoute } from '../features/review/models/review.model';

// Routes where the tab bar should be hidden (player / complete screens)
const HIDE_TAB_BAR_ROUTES = [
  '/listen/now-playing',
  '/listen/complete',
  ReviewRoute.PLAYER,
];

@Component({
  selector: 'lc-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, TranslatePipe],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);

  private readonly currentUrl = signal('');
  readonly hideTabBar = computed(() =>
    HIDE_TAB_BAR_ROUTES.some(r => this.currentUrl().startsWith(r))
  );

  constructor() {
    addIcons({ analyticsOutline, bookOutline, volumeHighOutline, playCircleOutline, folderOpenOutline, homeOutline });

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
  }
}
