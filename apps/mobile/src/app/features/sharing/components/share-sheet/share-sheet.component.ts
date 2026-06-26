import { Component, ChangeDetectionStrategy, inject, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonItem, IonLabel, IonInput, IonToggle, IonSpinner,
  ModalController, ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { ShareResourceType, ShareSyncMode } from '@lingua-card/shared/domain';
import { ShareApiService } from '../../services/share-api.service';

@Component({
  selector: 'lc-share-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TranslatePipe,
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonItem, IonInput, IonToggle, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'sharing.sheet.title' | translate }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">
            <span>✕</span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-input
          [label]="'sharing.sheet.emailLabel' | translate"
          labelPlacement="stacked"
          type="email"
          [placeholder]="'sharing.sheet.emailPlaceholder' | translate"
          [(ngModel)]="email"
        />
      </ion-item>

      <ion-item>
        <ion-toggle [(ngModel)]="syncEnabled" labelPlacement="start">
          {{ 'sharing.sheet.syncToggleLabel' | translate }}
        </ion-toggle>
      </ion-item>
      <p class="sync-description">{{ 'sharing.sheet.syncToggleDescription' | translate }}</p>

      <ion-button
        expand="block"
        [disabled]="!isValidEmail() || submitting()"
        (click)="submit()"
        class="share-btn"
      >
        @if (submitting()) {
          <ion-spinner name="crescent" />
        }
        {{ (submitting() ? 'sharing.sheet.sharingButton' : 'sharing.sheet.shareButton') | translate }}
      </ion-button>
    </ion-content>
  `,
  styles: [`
    @use 'theme/tokens' as t;

    .sync-description {
      padding: 0 t.$lc-space-4;
      font-size: t.$lc-text-sm;
      color: t.$lc-text-hint;
      margin-top: t.$lc-space-1;
    }

    .share-btn {
      margin-top: t.$lc-space-6;
    }
  `],
})
export class ShareSheetComponent {
  // @Input() required — Ionic ModalController sets componentProps via Object.assign(),
  // bypassing Angular's setInput() API. input() signals are overwritten with plain values.
  @Input() resourceType!: ShareResourceType;
  @Input() resourceId!: string;

  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly shareApi = inject(ShareApiService);

  email = '';
  syncEnabled = false;
  readonly submitting = signal(false);

  isValidEmail(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }

  async submit(): Promise<void> {
    if (!this.isValidEmail() || this.submitting()) return;

    this.submitting.set(true);
    const syncMode: ShareSyncMode = this.syncEnabled ? 'sync' : 'copy';

    try {
      await firstValueFrom(this.shareApi.createShare({
        recipientEmail: this.email.trim().toLowerCase(),
        resourceType: this.resourceType,
        resourceId: this.resourceId,
        syncMode,
      }));

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('sharing.sheet.successToast'),
        duration: 2500,
        color: 'success',
      });
      await toast.present();
      await this.modalCtrl.dismiss({ shared: true });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      let msgKey = 'sharing.sheet.errorGeneric';
      if (status === 404) msgKey = 'sharing.sheet.errorNotFound';
      if (status === 400) msgKey = 'sharing.sheet.errorSelf';

      const toast = await this.toastCtrl.create({
        message: this.translate.instant(msgKey),
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.submitting.set(false);
    }
  }
}
