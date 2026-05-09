import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

@Component({
  selector: 'lc-pwa-install-banner',
  standalone: true,
  imports: [NgIf, IonButton],
  template: `
    <!-- Android / Chrome / Edge: native install prompt -->
    <div class="install-banner" *ngIf="pwa.canInstall() && !pwa.isInstalled()">
      <div class="install-banner__content">
        <img class="install-banner__icon" src="icons/icon-96x96.png" alt="" width="48" height="48"/>
        <div class="install-banner__text">
          <span class="install-banner__title">Add to Home Screen</span>
          <span class="install-banner__subtitle">Install LinguaCard for quick access</span>
        </div>
      </div>
      <div class="install-banner__actions">
        <ion-button fill="clear" size="small" color="medium" (click)="dismiss()">Not now</ion-button>
        <ion-button fill="solid" size="small" (click)="install()">Install</ion-button>
      </div>
    </div>

    <!-- iOS Safari: manual instructions banner -->
    <div class="install-banner install-banner--ios" *ngIf="pwa.canInstallIos()">
      <button class="install-banner__close" (click)="dismissIos()" aria-label="Dismiss">✕</button>
      <div class="install-banner__content">
        <img class="install-banner__icon" src="icons/icon-96x96.png" alt="" width="44" height="44"/>
        <div class="install-banner__text">
          <span class="install-banner__title">Add to Home Screen</span>
          <span class="install-banner__subtitle">
            Tap
            <span class="install-banner__share-icon" aria-label="Share">
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M7 1v9M3.5 4L7 1l3.5 3M1 8v6a1 1 0 001 1h10a1 1 0 001-1V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            then <strong>Add to Home Screen</strong>
          </span>
        </div>
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

    .install-banner--ios {
      flex-direction: row;
      align-items: flex-start;
      padding: 14px 16px 18px;
    }

    .install-banner__close {
      position: absolute;
      top: 10px;
      right: 12px;
      background: none;
      border: none;
      font-size: 14px;
      color: var(--ion-color-medium, #92949c);
      cursor: pointer;
      padding: 4px;
      line-height: 1;
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
      gap: 4px;
      min-width: 0;
    }

    .install-banner__title {
      font-family: var(--lc-font-body, 'DM Sans', system-ui);
      font-size: 14px;
      font-weight: 600;
      color: var(--ion-text-color, #000);
    }

    .install-banner__subtitle {
      font-family: var(--lc-font-body, 'DM Sans', system-ui);
      font-size: 12px;
      color: var(--ion-color-medium, #92949c);
      line-height: 1.5;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;
    }

    .install-banner__subtitle strong {
      color: var(--ion-text-color, #000);
      font-weight: 600;
    }

    .install-banner__share-icon {
      display: inline-flex;
      align-items: center;
      color: #007AFF;
      vertical-align: middle;
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

  dismissIos(): void {
    this.pwa.dismissIos();
  }
}
