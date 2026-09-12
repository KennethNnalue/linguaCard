import { Component, computed, EnvironmentInjector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {NavigationEnd, Router} from '@angular/router';
import {IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs} from '@ionic/angular';
import {TranslatePipe} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  bookOutline,
  folderOpenOutline,
  homeOutline,
  playCircleOutline,
  volumeHighOutline,
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
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, TranslatePipe],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  private readonly currentUrl = signal(this.router.url);
  readonly hideTabBar = computed(() =>
    IMMERSIVE_PLAYER_ROUTES.some(route => route.test(this.currentUrl()))
  );
  readonly isListenArea = computed(() =>
    this.currentUrl().startsWith('/listen') || this.currentUrl().startsWith('/podcasts')
  );

  constructor() {
    addIcons({bookOutline, folderOpenOutline, homeOutline, playCircleOutline, volumeHighOutline});

    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
  }
}
