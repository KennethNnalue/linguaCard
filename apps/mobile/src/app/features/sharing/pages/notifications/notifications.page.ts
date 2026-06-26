import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import {
  AlertController, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonSegment, IonSegmentButton, IonLabel, ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { ShareNotification, ShareRecord, ShareStatus } from '@lingua-card/shared/domain';
import { ShareStore } from '../../store/share.store';
import { ShareApiService } from '../../services/share-api.service';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { StoryStore } from '../../../stories/store/story.store';

type NotificationsView = 'received' | 'sent';

const STATUS_LABEL_KEYS: Record<ShareStatus, string> = {
  pending: 'sharing.notifications.statusPending',
  accepted: 'sharing.notifications.statusAccepted',
  rejected: 'sharing.notifications.statusRejected',
  expired: 'sharing.notifications.statusExpired',
};

@Component({
  selector: 'lc-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonSegment, IonSegmentButton, IonLabel,
    TranslatePipe, EmptyStateComponent, ButtonComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" />
        </ion-buttons>
        <ion-title>{{ 'sharing.notifications.title' | translate }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="view()" (ionChange)="onSegmentChange($event)">
          <ion-segment-button value="received">
            <ion-label>{{ 'sharing.notifications.receivedTab' | translate }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="sent">
            <ion-label>{{ 'sharing.notifications.sentTab' | translate }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>

      @if (view() === 'received') {
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
                <lc-button variant="filled-accent" size="sm" (click)="accept(share)">
                  {{ 'sharing.notifications.acceptButton' | translate }}
                </lc-button>
                <lc-button variant="outline-primary" size="sm" (click)="confirmReject(share)">
                  {{ 'sharing.notifications.rejectButton' | translate }}
                </lc-button>
              </div>
            </div>
          }
        </div>
      } @else {
        @if (store.sentShares().length === 0 && !store.isLoading()) {
          <lc-empty-state
            [icon]="'📤'"
            [title]="'sharing.notifications.sentEmptyTitle' | translate"
            [subtitle]="'sharing.notifications.sentEmptySubtitle' | translate"
          />
        }

        <div class="notification-list">
          @for (share of store.sentShares(); track share.id) {
            <div class="notification-card">
              <div class="notification-icon">
                {{ share.resourceType === 'collection' ? (share.resourceEmoji ?? '📚') : '📖' }}
              </div>
              <div class="notification-body">
                <p class="notification-from">
                  {{ 'sharing.notifications.toLabel' | translate:{ email: share.recipientEmail } }}
                </p>
                <p class="notification-resource">
                  {{ share.resourceName }}
                </p>
                <div class="notification-meta">
                  <span class="status-pill" [class]="'status-pill--' + share.status">
                    {{ statusLabelKey(share.status) | translate }}
                  </span>
                  @if (share.syncMode === 'sync') {
                    <span class="sync-badge">{{ 'sharing.notifications.syncBadge' | translate }}</span>
                  }
                </div>
              </div>
              @if (share.status === 'pending') {
                <div class="notification-actions">
                  <lc-button variant="outline-primary" size="sm" (click)="confirmCancel(share)">
                    {{ 'sharing.notifications.cancelButton' | translate }}
                  </lc-button>
                </div>
              }
            </div>
          }
        </div>
      }
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
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly storyStore = inject(StoryStore);

  readonly view = signal<NotificationsView>('received');

  ngOnInit(): void {
    this.store.loadPending();
  }

  onSegmentChange(event: CustomEvent<{ value?: string | number }>): void {
    const value = event.detail.value;
    if (value === 'received' || value === 'sent') this.setView(value);
  }

  setView(view: NotificationsView): void {
    if (view === this.view()) return;
    this.view.set(view);
    if (view === 'sent') {
      this.store.loadSent();
    } else {
      this.store.loadPending();
    }
  }

  statusLabelKey(status: ShareStatus): string {
    return STATUS_LABEL_KEYS[status];
  }

  async accept(share: ShareNotification): Promise<void> {
    try {
      await firstValueFrom(this.shareApi.respondToShare(share.id, { accept: true }));
      // The server cloned the resource into this user's account — pull the new
      // collection/story (and its cards) into the relevant store so it shows up
      // immediately, without a relaunch.
      if (share.resourceType === 'collection') {
        this.collectionStore.loadCollections();
        this.cardStore.loadCards();
      } else {
        this.storyStore.loadStories();
      }
      // loadPending() already refreshes pendingCount from its `total`, so no
      // separate refreshCount() call is needed here.
      this.store.loadPending();
      const typeLabel = this.translate.instant(
        share.resourceType === 'collection' ? 'sharing.notifications.collectionLabel' : 'sharing.notifications.storyLabel',
      );
      await this.presentToast(
        'sharing.notifications.acceptedToast',
        { type: typeLabel.toLowerCase() },
        'success',
        2500,
      );
    } catch {
      await this.presentError();
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
          handler: () => { void this.reject(share); },
        },
      ],
    });
    await alert.present();
  }

  private async reject(share: ShareNotification): Promise<void> {
    try {
      await firstValueFrom(this.shareApi.respondToShare(share.id, { accept: false }));
      this.store.loadPending();
      await this.presentToast('sharing.notifications.rejectedToast');
    } catch {
      await this.presentError();
    }
  }

  async confirmCancel(share: ShareRecord): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('sharing.notifications.cancelConfirmHeader'),
      message: this.translate.instant('sharing.notifications.cancelConfirmMessage', {
        name: share.resourceName,
        email: share.recipientEmail,
      }),
      buttons: [
        { text: this.translate.instant('sharing.notifications.cancelKeepButton'), role: 'cancel' },
        {
          text: this.translate.instant('sharing.notifications.cancelConfirmButton'),
          role: 'destructive',
          handler: () => { void this.cancel(share); },
        },
      ],
    });
    await alert.present();
  }

  private async cancel(share: ShareRecord): Promise<void> {
    try {
      await firstValueFrom(this.shareApi.cancelShare(share.id));
      this.store.loadSent();
      await this.presentToast('sharing.notifications.cancelledToast');
    } catch {
      await this.presentError();
    }
  }

  private async presentToast(
    messageKey: string,
    params?: Record<string, unknown>,
    color?: string,
    duration = 2000,
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(messageKey, params),
      duration,
      color,
    });
    await toast.present();
  }

  private presentError(): Promise<void> {
    return this.presentToast('sharing.sheet.errorGeneric', undefined, 'danger', 3000);
  }
}
