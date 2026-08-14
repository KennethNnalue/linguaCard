import { Injectable } from '@nestjs/common';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';
import { UserSettingsService } from '../settings/user-settings.service';
import { ReviewProgressRepository } from './review-progress.repository';

@Injectable()
export class StatsService {
  constructor(
    private readonly reviewProgress: ReviewProgressRepository,
    private readonly settings: UserSettingsService,
  ) {}

  private localDayKey(iso: string, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  }

  private todayKey(timezone: string): string {
    return this.localDayKey(new Date().toISOString(), timezone);
  }

  private addDays(dayKey: string, delta: number): string {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  private async dailyCardCounts(userId: string, timezone: string): Promise<Map<string, number>> {
    const progress = await this.reviewProgress.dailyProgress(userId, timezone);
    return new Map(progress.map(day => [day.dayKey, day.uniqueCardsReviewed]));
  }

  async computeStreak(userId: string): Promise<StreakStatus> {
    const { dailyGoal, timezone } = await this.settings.getForUser(userId);
    const counts = await this.dailyCardCounts(userId, timezone);
    return this.streakFromCounts(counts, dailyGoal, timezone);
  }

  async computeGoalProgress(userId: string, period: GoalProgress['period']): Promise<GoalProgress> {
    const s = await this.settings.getForUser(userId);
    const counts = await this.dailyCardCounts(userId, s.timezone);
    return this.goalProgressFromCounts(counts, period, s);
  }

  // Used by the reminder scheduler: loads counts once and derives both streak
  // and daily progress without issuing redundant DB queries.
  async computeReminderContext(
    userId: string,
    settings: { dailyGoal: number; timezone: string },
  ): Promise<{ streak: StreakStatus; progress: GoalProgress }> {
    const counts = await this.dailyCardCounts(userId, settings.timezone);
    const today = this.todayKey(settings.timezone);
    const reviewed = counts.get(today) ?? 0;
    return {
      streak: this.streakFromCounts(counts, settings.dailyGoal, settings.timezone),
      progress: {
        period: 'daily',
        reviewed,
        goal: settings.dailyGoal,
        metGoal: reviewed >= settings.dailyGoal,
      },
    };
  }

  private streakFromCounts(
    counts: Map<string, number>,
    dailyGoal: number,
    timezone: string,
  ): StreakStatus {
    const metGoal = (key: string) => (counts.get(key) ?? 0) >= dailyGoal;
    const today = this.todayKey(timezone);
    const yesterday = this.addDays(today, -1);

    let state: StreakStatus['state'];
    let cursor: string;
    if (metGoal(today)) {
      state = 'safe';
      cursor = today;
    } else if (metGoal(yesterday)) {
      state = 'at_risk';
      cursor = yesterday;
    } else {
      return {
        current: 0,
        longest: this.longest(counts, dailyGoal),
        state: 'broken',
        lastGoalMetDate: this.lastMet(counts, dailyGoal),
      };
    }

    let current = 0;
    while (metGoal(cursor)) {
      current++;
      cursor = this.addDays(cursor, -1);
    }

    return {
      current,
      longest: Math.max(current, this.longest(counts, dailyGoal)),
      state,
      lastGoalMetDate: this.lastMet(counts, dailyGoal),
    };
  }

  private goalProgressFromCounts(
    counts: Map<string, number>,
    period: GoalProgress['period'],
    settings: { dailyGoal: number; weeklyGoal: number; monthlyGoal: number; timezone: string },
  ): GoalProgress {
    const today = this.todayKey(settings.timezone);

    const inWindow = (key: string): boolean => {
      if (period === 'daily') return key === today;
      const days = period === 'weekly' ? 7 : 30;
      let cur = today;
      for (let i = 0; i < days; i++) {
        if (key === cur) return true;
        cur = this.addDays(cur, -1);
      }
      return false;
    };

    const reviewed = [...counts.entries()]
      .filter(([k]) => inWindow(k))
      .reduce((sum, [, n]) => sum + n, 0);
    const goal = period === 'daily' ? settings.dailyGoal : period === 'weekly' ? settings.weeklyGoal : settings.monthlyGoal;
    return { period, reviewed, goal, metGoal: reviewed >= goal };
  }

  private longest(counts: Map<string, number>, goal: number): number {
    const days = [...counts.keys()].filter(k => (counts.get(k) ?? 0) >= goal).sort();
    let best = 0, run = 0, prev: string | null = null;
    for (const day of days) {
      run = (prev && this.addDays(prev, 1) === day) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = day;
    }
    return best;
  }

  private lastMet(counts: Map<string, number>, goal: number): string | null {
    const met = [...counts.keys()].filter(k => (counts.get(k) ?? 0) >= goal).sort();
    return met.length ? met[met.length - 1] : null;
  }
}
