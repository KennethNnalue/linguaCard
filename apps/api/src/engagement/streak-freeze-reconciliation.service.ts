import { Injectable } from '@nestjs/common';
import { Between, DataSource, LessThanOrEqual } from 'typeorm';
import { DailyProgressEntity } from './entities/daily-progress.entity';
import { StreakFreezeTransactionEntity } from './entities/streak-freeze-transaction.entity';
import { planClosedDayFreezeConsumptions } from './streak-freeze-reconciliation';

@Injectable()
export class StreakFreezeReconciliationService {
  constructor(private readonly dataSource: DataSource) {}

  async reconcileClosedDays(userId: string, todayKey: string, timeZone: string, occurredAt: Date): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`streak-freeze:${userId}`]);

      const progressRepository = manager.getRepository(DailyProgressEntity);
      const freezeRepository = manager.getRepository(StreakFreezeTransactionEntity);
      const firstProgress = await progressRepository.findOne({
        where: { userId, dayKey: LessThanOrEqual(todayKey) },
        order: { dayKey: 'ASC' },
      });
      if (!firstProgress || firstProgress.dayKey === todayKey) return;

      const progress = await progressRepository.findBy({
        userId,
        dayKey: Between(firstProgress.dayKey, todayKey),
      });
      const transactions = await freezeRepository.findBy({ userId });
      const plan = planClosedDayFreezeConsumptions({
        todayKey,
        firstTrackedDayKey: firstProgress.dayKey,
        progress: progress.map(day => ({
          dayKey: day.dayKey,
          reviewed: day.uniqueCardsReviewed,
          goal: day.targetUniqueCards,
        })),
        transactions: transactions.map(transaction => ({
          amount: transaction.amount,
          reason: transaction.reason,
          occurredDayKey: engagementDayKey(transaction.occurredAt, timeZone),
          protectedDayKey: transaction.protectedDayKey ?? undefined,
        })),
      });

      if (plan.protectedDayKeys.length === 0) return;
      await freezeRepository.insert(plan.protectedDayKeys.map(protectedDayKey => ({
        transactionId: `freeze-consumed:${userId}:${protectedDayKey}`,
        userId,
        occurredAt,
        amount: -1,
        reason: 'consumed' as const,
        protectedDayKey,
        sourceId: `freeze:${userId}:${protectedDayKey}`,
      })));
    });
  }
}

function engagementDayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}
