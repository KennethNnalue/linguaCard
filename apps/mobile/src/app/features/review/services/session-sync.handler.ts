import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewSessionApiService } from './review-session-api.service';
import { SyncOperationType } from '../models/review.model';
import { reviewHistoryCutoff } from '@lingua-card/shared/utils';

@Injectable({ providedIn: 'root' })
export class SessionSyncHandler implements SyncHandler {
  readonly type = SyncOperationType.FLUSH_REVIEW_SESSIONS;

  private readonly localData = inject(LocalDataService);
  private readonly sessionApi = inject(ReviewSessionApiService);

  async execute(payload: unknown): Promise<void> {
    if (!isUserPayload(payload)) return;
    const { userId } = payload;

    const queued = await this.localData.getPendingSessions(userId);
    const cutoff = reviewHistoryCutoff();
    const pending = queued.filter(session => new Date(session.startedAt) >= cutoff);
    if (pending.length !== queued.length) await this.localData.setPendingSessions(userId, pending);
    if (pending.length === 0) return;

    await firstValueFrom(this.sessionApi.upsertBatch(pending));
    const sentIds = new Set(pending.map(session => session.id));
    const current = await this.localData.getPendingSessions(userId);
    await this.localData.setPendingSessions(
      userId,
      current.filter(session => !sentIds.has(session.id)),
    );
  }
}

function isUserPayload(payload: unknown): payload is { userId: string } {
  return typeof payload === 'object' && payload !== null
    && 'userId' in payload && typeof payload.userId === 'string';
}
