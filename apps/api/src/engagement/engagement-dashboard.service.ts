import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserSettingsService } from '../settings/user-settings.service';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { RewardTransactionEntity } from './entities/reward-transaction.entity';
import { StreakFreezeTransactionEntity } from './entities/streak-freeze-transaction.entity';

export interface ServerEngagementDashboard {
  today: { reviewed: number; goal: number; goalComplete: boolean };
  streak: {
    current: number;
    longest: number;
    state: 'safe' | 'at_risk' | 'broken';
    lastQualifiedDayKey: string | null;
  };
  learningPoints: number;
  streakFreezes: number;
}

interface StreakAggregateRow {
  todayQualified: boolean;
  yesterdayQualified: boolean;
  currentFromToday: number;
  currentFromYesterday: number;
  longest: number;
  lastQualifiedDayKey: string | null;
}

function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

function previousDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function streakAggregate(value: unknown): StreakAggregateRow {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('Invalid streak aggregate result');
  }
  const row = value[0];
  return {
    todayQualified: row['todayQualified'] === true,
    yesterdayQualified: row['yesterdayQualified'] === true,
    currentFromToday: Number(row['currentFromToday'] ?? 0),
    currentFromYesterday: Number(row['currentFromYesterday'] ?? 0),
    longest: Number(row['longest'] ?? 0),
    lastQualifiedDayKey: typeof row['lastQualifiedDayKey'] === 'string' ? row['lastQualifiedDayKey'] : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class EngagementDashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: UserSettingsService,
  ) {}

  async dashboard(userId: string): Promise<ServerEngagementDashboard> {
    const settings = await this.settings.getForUser(userId);
    const todayKey = dayKey(new Date(), settings.timezone);
    const yesterdayKey = previousDay(todayKey);
    const progress = await this.dataSource.getRepository(DailyProgressEntity).findOneBy({ userId, dayKey: todayKey });
    const [streak, points, freezes] = await Promise.all([
      this.loadStreak(userId, todayKey, yesterdayKey),
      this.sumColumn(RewardTransactionEntity, userId, 'amount'),
      this.sumColumn(StreakFreezeTransactionEntity, userId, 'amount'),
    ]);
    const state = streak.todayQualified ? 'safe' : streak.yesterdayQualified ? 'at_risk' : 'broken';
    return {
      today: {
        reviewed: progress?.uniqueCardsReviewed ?? 0,
        goal: progress?.targetUniqueCards ?? settings.dailyGoal,
        goalComplete: progress !== null && progress.uniqueCardsReviewed >= progress.targetUniqueCards,
      },
      streak: {
        current: state === 'safe' ? streak.currentFromToday : state === 'at_risk' ? streak.currentFromYesterday : 0,
        longest: streak.longest,
        state,
        lastQualifiedDayKey: streak.lastQualifiedDayKey,
      },
      learningPoints: points,
      streakFreezes: freezes,
    };
  }

  private async loadStreak(userId: string, todayKey: string, yesterdayKey: string): Promise<StreakAggregateRow> {
    const rows: unknown = await this.dataSource.query(`
      WITH qualified AS (
        SELECT "dayKey"::date AS day_key
        FROM daily_progress
        WHERE "userId" = $1 AND "uniqueCardsReviewed" >= "targetUniqueCards"
        UNION
        SELECT "protectedDayKey"::date AS day_key
        FROM streak_freeze_transactions
        WHERE "userId" = $1 AND reason = 'consumed' AND "protectedDayKey" IS NOT NULL
      ), grouped AS (
        SELECT day_key, day_key - (ROW_NUMBER() OVER (ORDER BY day_key))::int AS island
        FROM qualified
      ), runs AS (
        SELECT MIN(day_key) AS start_day, MAX(day_key) AS end_day, COUNT(*)::int AS length
        FROM grouped GROUP BY island
      )
      SELECT
        EXISTS(SELECT 1 FROM qualified WHERE day_key = $2::date) AS "todayQualified",
        EXISTS(SELECT 1 FROM qualified WHERE day_key = $3::date) AS "yesterdayQualified",
        COALESCE((SELECT length FROM runs WHERE end_day = $2::date), 0)::int AS "currentFromToday",
        COALESCE((SELECT length FROM runs WHERE end_day = $3::date), 0)::int AS "currentFromYesterday",
        COALESCE((SELECT MAX(length) FROM runs), 0)::int AS longest,
        (SELECT MAX(day_key)::text FROM qualified) AS "lastQualifiedDayKey"
    `, [userId, todayKey, yesterdayKey]);
    return streakAggregate(rows);
  }

  private async sumColumn(
    entity: typeof RewardTransactionEntity | typeof StreakFreezeTransactionEntity,
    userId: string,
    column: 'amount',
  ): Promise<number> {
    const result = await this.dataSource.getRepository(entity).createQueryBuilder('transaction')
      .select(`COALESCE(SUM(transaction.${column}), 0)`, 'total')
      .where('transaction.userId = :userId', { userId })
      .getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }
}
