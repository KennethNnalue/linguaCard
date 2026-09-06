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

const IMMERSIVE_PLAYER_ROUTES = [
  /^\/listen\/now-playing(?:[/?#]|$)/,
  /^\/podcasts\/episodes\/[^/]+\/player(?:[/?#]|$)/,
  /^\/admin\/podcasts(?:[/?#]|$)/,
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
    IMMERSIVE_PLAYER_ROUTES.some(route => route.test(this.currentUrl()))
  );
  readonly isListenArea = computed(() =>
    this.currentUrl().startsWith('/listen') || this.currentUrl().startsWith('/podcasts')
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
