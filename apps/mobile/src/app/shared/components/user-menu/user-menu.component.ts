import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonToggle } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  chevronForwardOutline,
  cloudUploadOutline,
  languageOutline,
  logOutOutline,
  moonOutline,
  notificationsOutline,
  rocketOutline,
  syncOutline,
  trashOutline,
  trophyOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';
import { ThemeService } from '../../../core/services/theme.service';
import { SettingsStore } from '../../../features/settings/store/settings.store';
import { SubscriptionStore } from '../../../features/subscription/store/subscription.store';

@Component({
  selector: 'lc-user-menu',
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, IonToggle, RouterLink, TranslatePipe],
})
export class UserMenuComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly sync = inject(SyncService);
  readonly subscriptionStore = inject(SubscriptionStore);
  private readonly translate = inject(TranslateService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);

  readonly closed = output<void>();
  readonly resetRequested = output<void>();

  constructor() {
    addIcons({ moonOutline, syncOutline, trashOutline, logOutOutline, chevronForwardOutline, trophyOutline, notificationsOutline, cloudUploadOutline, languageOutline, rocketOutline });
  }

  get syncLabel(): string {
    const status = this.sync.syncStatus();
    const count = this.sync.pendingCount();
    switch (status) {
      case 'pending': return this.translate.instant('sync.status.pending', { count });
      case 'syncing': return this.translate.instant('sync.status.syncing');
      case 'error':   return this.translate.instant('sync.status.errorRetry');
      default:        return this.translate.instant('sync.status.synced');
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

  async replayOnboarding(): Promise<void> {
    this.closed.emit();
    await this.settingsStore.update({
      onboardingStep: 0,
      completeOnboarding: false,
    });
    this.settingsStore.setFromServer({
      ...this.settingsStore.settings()!,
      onboardingCompletedAt: null,
      onboardingStep: 0,
    });
    void this.router.navigateByUrl('/onboarding');
  }

  signOut(): void {
    this.closed.emit();
    this.auth.logout();
  }
}
