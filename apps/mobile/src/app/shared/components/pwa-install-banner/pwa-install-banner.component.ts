import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

@Component({
  selector: 'lc-pwa-install-banner',
  standalone: true,
  imports: [NgIf, IonButton],
  template: `
    <div class="install-banner" *ngIf="pwa.canInstall() && !pwa.isInstalled()">
      <div class="install-banner__content">
        <img class="install-banner__icon" src="icons/icon-96x96.png" alt="LinguaCard icon" width="48" height="48"/>
        <div class="install-banner__text">
          <span class="install-banner__title">Add to Home Screen</span>
          <span class="install-banner__subtitle">Install LinguaCard for quick access</span>
        </div>
      </div>
      <div class="install-banner__actions">
        <ion-button fill="clear" size="small" color="medium" (click)="dismiss()">
          Not now
        </ion-button>
        <ion-button fill="solid" size="small" (click)="install()">
          Install
        </ion-button>
      </div>
    </div>
  `,
  styles: [`
    .install-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: var(--ion-background-color, #fff);
      border-top: 1px solid var(--ion-color-light-shade, #e0e0e0);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
      animation: slideUp 260ms ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

    .install-banner__content {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .install-banner__icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      flex-shrink: 0;
    }

    .install-banner__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .install-banner__title {
      font-family: var(--lc-font-body, 'DM Sans', system-ui);
      font-size: 14px;
      font-weight: 600;
      color: var(--ion-text-color, #000);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .install-banner__subtitle {
      font-family: var(--lc-font-body, 'DM Sans', system-ui);
      font-size: 12px;
      color: var(--ion-color-medium, #92949c);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .install-banner__actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    ion-button[fill="solid"] {
      --background: var(--lc-brand, #2D5A4E);
      --border-radius: 8px;
    }
  `],
})
export class PwaInstallBannerComponent {
  readonly pwa = inject(PwaInstallService);

  async install(): Promise<void> {
    await this.pwa.promptInstall();
  }

  dismiss(): void {
    this.pwa.dismiss();
  }
}
