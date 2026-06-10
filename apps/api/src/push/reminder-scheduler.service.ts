import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserSettingsService } from '../settings/user-settings.service';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import { StatsService } from '../stats/stats.service';
import { PushService } from './push.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly settings: UserSettingsService,
    private readonly stats: StatsService,
    private readonly push: PushService,
  ) {}

  @Cron('0 * * * *')
  async sendDueReminders(): Promise<void> {
    const candidates = await this.settings.findReminderCandidates();
    const now = new Date();

    // Pre-filter to only users whose local reminder hour matches now and who
    // haven't been reminded today — avoids loading stats for the full user set.
    const due = candidates.filter(s => {
      const localHour = this.hourInTz(now, s.timezone);
      const [reminderHour] = s.reminderTime.split(':').map(Number);
      const todayKey = this.dayKeyInTz(now, s.timezone);
      return localHour === reminderHour && s.lastRemindedOn !== todayKey;
    });

    // Process eligible users in parallel; errors for individual users are
    // caught inside sendReminderToUser so one failure doesn't block others.
    await Promise.allSettled(due.map(s => this.sendReminderToUser(s, now)));
  }

  private async sendReminderToUser(s: UserSettingsEntity, now: Date): Promise<void> {
    try {
      // computeReminderContext shares a single findRecent query for both streak
      // and daily progress, halving the DB round-trips vs calling each separately.
      const { streak, progress } = await this.stats.computeReminderContext(s.userId, s);
      if (progress.metGoal) return;

      const remaining = Math.max(0, progress.goal - progress.reviewed);
      const body = streak.current > 0
        ? `Keep your ${streak.current}-day streak alive — ${remaining} cards to go!`
        : `${remaining} cards left to hit today's goal. Let's go!`;

      await this.push.sendToUser(s.userId, { title: 'Time to review 📚', body, url: '/review' });
      await this.settings.markReminded(s.userId, this.dayKeyInTz(now, s.timezone));
      this.logger.log(`Sent reminder to user ${s.userId}`);
    } catch (err) {
      this.logger.warn(`Failed to send reminder to user ${s.userId}: ${(err as Error).message}`);
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
