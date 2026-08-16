import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserSettingsService } from '../settings/user-settings.service';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import { EngagementDashboardService } from '../engagement/engagement-dashboard.service';
import { PushService } from './push.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly settings: UserSettingsService,
    private readonly engagement: EngagementDashboardService,
    private readonly push: PushService,
  ) {}

  @Cron('0 * * * *')
  async sendDueReminders(): Promise<void> {
    const candidates = await this.settings.findReminderCandidates();
    const now = new Date();

    const due = candidates.filter(s => {
      const localHour = this.hourInTz(now, s.timezone);
      const [reminderHour] = s.reminderTime.split(':').map(Number);
      const todayKey = this.dayKeyInTz(now, s.timezone);
      return localHour === reminderHour && s.lastRemindedOn !== todayKey;
    });

    await Promise.allSettled(due.map(s => this.sendReminderToUser(s, now)));
  }

  private async sendReminderToUser(s: UserSettingsEntity, now: Date): Promise<void> {
    try {
      const dashboard = await this.engagement.dashboard(s.userId);
      if (dashboard.today.goalComplete) return;

      const remaining = Math.max(0, dashboard.today.goal - dashboard.today.reviewed);
      const body = dashboard.streak.current > 0
        ? `Keep your ${dashboard.streak.current}-day streak alive — ${remaining} cards to go!`
        : `${remaining} cards left to hit today's goal. Let's go!`;

      await this.push.sendToUser(s.userId, { title: 'Time to review 📚', body, url: '/review' });
      await this.settings.markReminded(s.userId, this.dayKeyInTz(now, s.timezone));
      this.logger.log(`Sent reminder to user ${s.userId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown engagement dashboard error';
      this.logger.warn(`Failed to send reminder to user ${s.userId}: ${message}`);
    }
  }

  private hourInTz(date: Date, tz: string): number {
    return Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date)
    );
  }

  private dayKeyInTz(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }
}
