import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { EngagementApiService } from '../data-access/engagement-api.service';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EngagementDashboard } from '../models/engagement-view.models';
import { EngagementDayView } from '../models/engagement-view.models';

export interface ServerEngagementReconciliation {
  dashboard: EngagementDashboard;
  appliedServerDashboard: boolean;
  recentDays: readonly EngagementDayView[] | null;
}

@Injectable({ providedIn: 'root' })
export class ReconcileEngagementWithServerService {
  private readonly api = inject(EngagementApiService);
  private readonly reviewRepository = inject(ReviewLocalRepository);
  private readonly engagementRepository = inject(EngagementLocalRepository);

  async reconcile(userId: string, optimisticDashboard: EngagementDashboard): Promise<ServerEngagementReconciliation> {
    const [serverSnapshot, pendingCommits] = await Promise.all([
      firstValueFrom(this.api.dashboard()),
      this.reviewRepository.pendingCommits(userId),
    ]);
    const reconciledAt = new Date().toISOString();
    if (pendingCommits.length > 0) {
      await this.recordSuccessfulReconciliation(userId, reconciledAt);
      return { dashboard: optimisticDashboard, appliedServerDashboard: false, recentDays: null };
    }
    await this.engagementRepository.mutate(userId, state => ({
      ...state,
      streakFreezeTransactions: serverSnapshot.streakFreezeTransactions,
      lastSuccessfulServerReconciliationAt: reconciledAt,
    }));
    return { dashboard: serverSnapshot.dashboard, appliedServerDashboard: true, recentDays: serverSnapshot.recentDays };
  }

  private async recordSuccessfulReconciliation(userId: string, reconciledAt: string): Promise<void> {
    await this.engagementRepository.mutate(userId, state => ({
      ...state,
      lastSuccessfulServerReconciliationAt: reconciledAt,
    }));
  }
}
