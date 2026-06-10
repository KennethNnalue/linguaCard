import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { SettingsStore } from '../../store/settings.store';
import { PushService } from '../../../../core/services/push.service';

@Component({
  selector: 'lc-reminders',
  templateUrl: './reminders.page.html',
  styleUrl: './reminders.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar],
})
export class RemindersPage {
  private readonly settingsStore = inject(SettingsStore);
  private readonly pushService = inject(PushService);
  private readonly router = inject(Router);

  readonly isSupported = this.pushService.isSupported;
  readonly remindersEnabled = computed(() => this.settingsStore.settings()?.remindersEnabled ?? false);
  readonly reminderTime = computed(() => this.settingsStore.settings()?.reminderTime ?? '19:00');
  readonly permissionState = signal<'default' | 'granted' | 'denied'>(
    typeof Notification !== 'undefined' ? (Notification.permission as 'default' | 'granted' | 'denied') : 'default'
  );
  readonly toggling = signal(false);

  goBack(): void {
    void this.router.navigate(['/home']);
  }

  async toggleReminders(enabled: boolean): Promise<void> {
    if (this.toggling()) return;
    this.toggling.set(true);
    try {
      if (enabled) {
        const ok = await this.pushService.enable();
        if (ok) {
          this.permissionState.set('granted');
          await this.settingsStore.update({
            remindersEnabled: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        } else {
          this.permissionState.set(
            typeof Notification !== 'undefined'
              ? (Notification.permission as 'default' | 'granted' | 'denied')
              : 'denied'
          );
        }
      } else {
        await this.pushService.disable();
        await this.settingsStore.update({ remindersEnabled: false });
      }
    } finally {
      this.toggling.set(false);
    }
  }

  async setReminderTime(time: string): Promise<void> {
    await this.settingsStore.update({
      reminderTime: time,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }
}
