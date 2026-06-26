import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import {
  AlertController, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { ShareNotification } from '@lingua-card/shared/domain';
import { ShareStore } from '../../store/share.store';
import { ShareApiService } from '../../services/share-api.service';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';

@Component({
  selector: 'lc-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    TranslatePipe, EmptyStateComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" />
        </ion-buttons>
        <ion-title>{{ 'sharing.notifications.title' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>

      @if (store.pendingShares().length === 0 && !store.isLoading()) {
        <lc-empty-state
          [icon]="'📬'"
          [title]="'sharing.notifications.emptyTitle' | translate"
          [subtitle]="'sharing.notifications.emptySubtitle' | translate"
        />
      }

      <div class="notification-list">
        @for (share of store.pendingShares(); track share.id) {
          <div class="notification-card">
            <div class="notification-icon">
              {{ share.resourceType === 'collection' ? (share.resourceEmoji ?? '📚') : '📖' }}
            </div>
            <div class="notification-body">
              <p class="notification-from">
                {{ 'sharing.notifications.fromLabel' | translate:{ name: share.senderName } }}
              </p>
              <p class="notification-resource">
                {{ share.resourceName }}
              </p>
              <div class="notification-meta">
                <span class="resource-type">
                  {{ (share.resourceType === 'collection' ? 'sharing.notifications.collectionLabel' : 'sharing.notifications.storyLabel') | translate }}
                </span>
                @if (share.syncMode === 'sync') {
                  <span class="sync-badge">{{ 'sharing.notifications.syncBadge' | translate }}</span>
                }
              </div>
            </div>
            <div class="notification-actions">
              <button class="accept-btn" (click)="accept(share)">
                {{ 'sharing.notifications.acceptButton' | translate }}
              </button>
              <button class="reject-btn" (click)="confirmReject(share)">
                {{ 'sharing.notifications.rejectButton' | translate }}
              </button>
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage implements OnInit {
  readonly store = inject(ShareStore);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly shareApi = inject(ShareApiService);

  ngOnInit(): void {
    this.store.loadPending();
  }

  async accept(share: ShareNotification): Promise<void> {
    try {
      await firstValueFrom(this.shareApi.respondToShare(share.id, { accept: true }));
      this.store.loadPending();
      const typeLabel = this.translate.instant(
        share.resourceType === 'collection' ? 'sharing.notifications.collectionLabel' : 'sharing.notifications.storyLabel',
      );
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('sharing.notifications.acceptedToast', { type: typeLabel.toLowerCase() }),
        duration: 2500,
        color: 'success',
      });
      await toast.present();
    } catch {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('sharing.sheet.errorGeneric'),
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async confirmReject(share: ShareNotification): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('sharing.notifications.rejectConfirmHeader'),
      message: this.translate.instant('sharing.notifications.rejectConfirmMessage', { name: share.resourceName }),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('sharing.notifications.rejectConfirmButton'),
          role: 'destructive',
          handler: () => {
            this.store.rejectShare(share.id);
            void this.toastCtrl.create({
              message: this.translate.instant('sharing.notifications.rejectedToast'),
              duration: 2000,
            }).then(t => t.present());
          },
        },
      ],
    });
    await alert.present();
  }
}
