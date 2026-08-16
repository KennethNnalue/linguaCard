import { inject, Injectable } from '@angular/core';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { PersistedEngagementState } from '../data-access/engagement-local.models';
import { reconcileClosedStreakDays, resolveEngagementDayKey } from '../domain/engagement-domain';
import { EngagementActivity, EngagementDashboard } from '../models/engagement-view.models';
import { buildEngagementDashboard } from './build-engagement-dashboard';
import { buildEngagementActivity } from './build-engagement-activity';

function streakDaysEqual(
  left: PersistedEngagementState['streakDays'],
  right: PersistedEngagementState['streakDays'],
): boolean {
  return left.length === right.length && left.every((day, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && day.dayKey === candidate.dayKey
      && day.goalTarget === candidate.goalTarget
      && day.uniqueCardsReviewed === candidate.uniqueCardsReviewed
      && day.status === candidate.status
      && day.freezeTransactionId === candidate.freezeTransactionId;
  });
}

export interface ReconcileStreakFreezesRequest {
  userId: string;
  timeZone: string;
  configuredDailyGoal: number;
  occurredAt: Date;
}

export interface ReconcileStreakFreezesOutcome {
  dashboard: EngagementDashboard;
  activity: EngagementActivity;
  consumedFreezeCount: number;
}

@Injectable({ providedIn: 'root' })
export class ReconcileStreakFreezesService {
  private readonly repository = inject(EngagementLocalRepository);

  async reconcile(request: ReconcileStreakFreezesRequest): Promise<ReconcileStreakFreezesOutcome> {
    const todayKey = resolveEngagementDayKey(request.occurredAt, request.timeZone);
    let consumedFreezeCount = 0;
    const state = await this.repository.mutate(request.userId, current => {
      const reconciliation = reconcileClosedStreakDays({
        userId: request.userId, todayKey, occurredAt: request.occurredAt,
        days: current.streakDays, transactions: current.streakFreezeTransactions,
        goalTarget: () => request.configuredDailyGoal,
        transactionId: dayKey => `freeze-consumed:${request.userId}:${dayKey}`,
        transactionDayKey: occurredAt => resolveEngagementDayKey(occurredAt, request.timeZone),
      });
      consumedFreezeCount = reconciliation.consumed.length;
      if (reconciliation.consumed.length === 0 && streakDaysEqual(reconciliation.days, current.streakDays)) return current;
      return {
        ...current,
        streakDays: reconciliation.days,
        streakFreezeTransactions: reconciliation.transactions,
      };
    });
    return {
      dashboard: buildEngagementDashboard(state, todayKey, request.configuredDailyGoal),
      activity: buildEngagementActivity(state, todayKey, request.configuredDailyGoal),
      consumedFreezeCount,
    };
  }
}
