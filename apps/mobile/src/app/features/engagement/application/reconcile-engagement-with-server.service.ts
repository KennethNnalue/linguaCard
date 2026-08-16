import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { EngagementApiService } from '../data-access/engagement-api.service';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EngagementDashboard } from '../models/engagement-view.models';

export interface ServerEngagementReconciliation {
  dashboard: EngagementDashboard;
  appliedServerDashboard: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReconcileEngagementWithServerService {
  private readonly api = inject(EngagementApiService);
  private readonly reviewRepository = inject(ReviewLocalRepository);
  private readonly engagementRepository = inject(EngagementLocalRepository);

  async reconcile(userId: string, optimisticDashboard: EngagementDashboard): Promise<ServerEngagementReconciliation> {
    const [serverDashboard, pendingCommits] = await Promise.all([
      firstValueFrom(this.api.dashboard()),
      this.reviewRepository.pendingCommits(userId),
    ]);
    const reconciledAt = new Date().toISOString();
    await this.engagementRepository.mutate(userId, state => ({
      ...state,
      lastSuccessfulServerReconciliationAt: reconciledAt,
    }));
    if (pendingCommits.length > 0) {
      return { dashboard: optimisticDashboard, appliedServerDashboard: false };
    }
    return { dashboard: serverDashboard, appliedServerDashboard: true };
  }
}
