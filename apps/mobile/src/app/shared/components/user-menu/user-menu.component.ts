import { Component, EventEmitter, inject, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonToggle } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronForwardOutline,
  cloudUploadOutline,
  logOutOutline,
  moonOutline,
  notificationsOutline,
  syncOutline,
  trashOutline,
  trophyOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';
import { ThemeService } from '../../../core/services/theme.service';
import { SubscriptionStore } from '../../../features/subscription/store/subscription.store';

@Component({
  selector: 'lc-user-menu',
  standalone: true,
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
  imports: [IonIcon, IonToggle, RouterLink],
})
export class UserMenuComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly sync = inject(SyncService);
  readonly subscriptionStore = inject(SubscriptionStore);

  @Output() closed = new EventEmitter<void>();
  @Output() resetRequested = new EventEmitter<void>();

  constructor() {
    addIcons({ moonOutline, syncOutline, trashOutline, logOutOutline, chevronForwardOutline, trophyOutline, notificationsOutline, cloudUploadOutline });
  }

  get syncLabel(): string {
    const status = this.sync.syncStatus();
    const count = this.sync.pendingCount();
    switch (status) {
      case 'pending': return `${count} pending`;
      case 'syncing': return 'Syncing…';
      case 'error':   return 'Sync error — tap to retry';
      default:        return 'Synced';
    }
  }

  get syncClass(): string {
    return `sync-dot sync-dot--${this.sync.syncStatus()}`;
  }

  onSyncClick(): void {
    if (this.sync.syncStatus() === 'error') {
      void this.sync.forceSync();
    }
  }

  onResetClick(): void {
    this.closed.emit();
    this.resetRequested.emit();
  }

  signOut(): void {
    this.closed.emit();
    this.auth.logout();
  }
}
