import { Injectable } from '@nestjs/common';
import {
  DAILY_STREAK_POLICY,
  MAX_STREAK_FREEZE_INVENTORY,
  STREAK_FREEZE_GOAL_INTERVAL,
} from '@lingua-card/shared/domain';
import { Between, DataSource } from 'typeorm';
import { UserSettingsService } from '../settings/user-settings.service';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { RewardTransactionEntity } from './entities/reward-transaction.entity';
import { StreakFreezeTransactionEntity } from './entities/streak-freeze-transaction.entity';
import { StreakFreezeReconciliationService } from './streak-freeze-reconciliation.service';

export interface ServerEngagementDashboard {
  today: { reviewed: number; goal: number; goalComplete: boolean };
  personalGoal: { reviewed: number; goal: number; goalComplete: boolean };
  streak: {
    current: number;
    longest: number;
    state: 'safe' | 'at_risk' | 'broken';
    lastQualifiedDayKey: string | null;
  };
  learningPoints: number;
  streakFreezes: number;
  streakFreezeProgress: { daysTowardNext: number; interval: number; atCapacity: boolean };
  streakFreezeTransactions: readonly ServerStreakFreezeTransaction[];
  recentDays: readonly ServerEngagementDay[];
}

export interface ServerStreakFreezeTransaction {
  transactionId: string;
  userId: string;
  occurredAt: string;
  amount: number;
  reason: 'granted' | 'consumed' | 'revoked' | 'expired';
  protectedDayKey: string | null;
  sourceId: string;
}

export interface ServerEngagementDay {
  dayKey: string;
  reviewed: number;
  goal: number;
  status: 'goal_met' | 'protected_by_freeze' | 'missed' | 'open' | 'untracked';
}

interface StreakAggregateRow {
  todayQualified: boolean;
  yesterdayQualified: boolean;
  currentFromToday: number;
  currentFromYesterday: number;
  longest: number;
  lastQualifiedDayKey: string | null;
  qualifyingGoalDayCount: number;
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

function recentDayKeys(todayKey: string, count: number): readonly string[] {
  const keys = [todayKey];
  while (keys.length < count) keys.unshift(previousDay(keys[0]));
  return keys;
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
    qualifyingGoalDayCount: Number(row['qualifyingGoalDayCount'] ?? 0),
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
    private readonly freezeReconciliation: StreakFreezeReconciliationService,
  ) {}

  async dashboard(userId: string): Promise<ServerEngagementDashboard> {
    const settings = await this.settings.getForUser(userId);
    const now = new Date();
    const todayKey = dayKey(now, settings.timezone);
    const yesterdayKey = previousDay(todayKey);
    await this.freezeReconciliation.reconcileClosedDays(userId, todayKey, settings.timezone, now);
    const progress = await this.dataSource.getRepository(DailyProgressEntity).findOneBy({ userId, dayKey: todayKey });
    const [streak, points, freezeTransactions, recentDays] = await Promise.all([
      this.loadStreak(userId, todayKey, yesterdayKey),
      this.sumColumn(RewardTransactionEntity, userId, 'amount'),
      this.dataSource.getRepository(StreakFreezeTransactionEntity).findBy({ userId }),
      this.loadRecentDays(userId, todayKey, DAILY_STREAK_POLICY.requiredUniqueReviews),
    ]);
    const freezes = freezeTransactions.reduce((total, transaction) => total + transaction.amount, 0);
    const state = streak.todayQualified ? 'safe' : streak.yesterdayQualified ? 'at_risk' : 'broken';
    return {
      today: {
        reviewed: progress?.uniqueCardsReviewed ?? 0,
        goal: progress?.targetUniqueCards ?? DAILY_STREAK_POLICY.requiredUniqueReviews,
        goalComplete: progress !== null && progress.uniqueCardsReviewed >= progress.targetUniqueCards,
      },
      personalGoal: {
        reviewed: progress?.uniqueCardsReviewed ?? 0,
        goal: settings.dailyGoal,
        goalComplete: (progress?.uniqueCardsReviewed ?? 0) >= settings.dailyGoal,
      },
      streak: {
        current: state === 'safe' ? streak.currentFromToday : state === 'at_risk' ? streak.currentFromYesterday : 0,
        longest: streak.longest,
        state,
        lastQualifiedDayKey: streak.lastQualifiedDayKey,
      },
      learningPoints: points,
      streakFreezes: freezes,
      streakFreezeProgress: {
        daysTowardNext: freezes >= MAX_STREAK_FREEZE_INVENTORY
          ? 0
          : streak.qualifyingGoalDayCount % STREAK_FREEZE_GOAL_INTERVAL,
        interval: STREAK_FREEZE_GOAL_INTERVAL,
        atCapacity: freezes >= MAX_STREAK_FREEZE_INVENTORY,
      },
      streakFreezeTransactions: freezeTransactions.map(transaction => ({
        transactionId: transaction.transactionId,
        userId: transaction.userId,
        occurredAt: transaction.occurredAt.toISOString(),
        amount: transaction.amount,
        reason: transaction.reason,
        protectedDayKey: transaction.protectedDayKey,
        sourceId: transaction.sourceId,
      })),
      recentDays,
    };
  }

  private async loadRecentDays(userId: string, todayKey: string, configuredGoal: number): Promise<readonly ServerEngagementDay[]> {
    const keys = recentDayKeys(todayKey, 14);
    const [progressRows, protectedRows, firstProgress] = await Promise.all([
      this.dataSource.getRepository(DailyProgressEntity).findBy({ userId, dayKey: Between(keys[0], todayKey) }),
      this.dataSource.getRepository(StreakFreezeTransactionEntity).findBy({
        userId,
        reason: 'consumed',
        protectedDayKey: Between(keys[0], todayKey),
      }),
      this.dataSource.getRepository(DailyProgressEntity).findOne({
        where: { userId, dayKey: Between('0001-01-01', todayKey) },
        order: { dayKey: 'ASC' },
      }),
    ]);
    const progressByDay = new Map(progressRows.map(progress => [progress.dayKey, progress]));
    const protectedDays = new Set(protectedRows.flatMap(transaction =>
      transaction.protectedDayKey ? [transaction.protectedDayKey] : []));
    return keys.map(dayKey => {
      const progress = progressByDay.get(dayKey);
      const reviewed = progress?.uniqueCardsReviewed ?? 0;
      const goal = progress?.targetUniqueCards ?? configuredGoal;
      const status: ServerEngagementDay['status'] = reviewed >= goal
        ? 'goal_met'
        : protectedDays.has(dayKey)
          ? 'protected_by_freeze'
          : dayKey === todayKey
            ? 'open'
            : !firstProgress || dayKey < firstProgress.dayKey ? 'untracked' : 'missed';
      return { dayKey, reviewed, goal, status };
    });
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
        (SELECT MAX(day_key)::text FROM qualified) AS "lastQualifiedDayKey",
        (SELECT COUNT(*)::int FROM daily_progress
          WHERE "userId" = $1 AND "uniqueCardsReviewed" >= "targetUniqueCards") AS "qualifyingGoalDayCount"
    `, [userId, todayKey, yesterdayKey]);
    return streakAggregate(rows);
  }

  private async sumColumn(
    entity: typeof RewardTransactionEntity,
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
