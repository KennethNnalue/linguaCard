import { Component, inject, signal } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { sparklesOutline } from 'ionicons/icons';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

@Component({
  selector: 'lc-update-banner',
  templateUrl: './update-banner.component.html',
  styleUrls: ['./update-banner.component.scss'],
  imports: [IonIcon, TranslatePipe],
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
export class UpdateBannerComponent {
  private readonly pwaUpdate = inject(PwaUpdateService);

  readonly isVisible = this.pwaUpdate.updateAvailable;
  readonly isReloading = signal(false);

  constructor() {
    addIcons({ sparklesOutline });
  }

  async reload(): Promise<void> {
    if (this.isReloading()) return;
    this.isReloading.set(true);
    await this.pwaUpdate.activateUpdate();
  }
}
