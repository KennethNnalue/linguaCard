import { Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline } from 'ionicons/icons';
import { NetworkService } from '../../../core/services/network.service';

@Component({
  selector: 'lc-offline-banner',
  templateUrl: './offline-banner.component.html',
  styleUrls: ['./offline-banner.component.scss'],
  imports: [IonIcon],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(-100%)', opacity: 0 })),
      ]),
    ]),
  ],
})
export class OfflineBannerComponent implements OnDestroy {
  private readonly networkService = inject(NetworkService);

  readonly isVisible = signal(false);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Suppress banner for the first 3 seconds to avoid flash on slow boot
  private readonly bootSuppressed = signal(true);

  constructor() {
    addIcons({ cloudOfflineOutline });
    setTimeout(() => this.bootSuppressed.set(false), 3000);

    effect(() => {
      const offline = this.networkService.isOffline();
      const suppressed = this.bootSuppressed();

      if (suppressed) return;

      if (offline) {
        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
        this.isVisible.set(true);
      } else {
        this.hideTimer = setTimeout(() => {
          this.isVisible.set(false);
          this.hideTimer = null;
        }, 1000);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }
}
