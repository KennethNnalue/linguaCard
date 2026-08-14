import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { ReviewCommitApiService } from './review-commit-api.service';
import { SyncOperationType } from '../models/review.model';
import { ReviewLocalRepository } from './review-local.repository';

@Injectable({ providedIn: 'root' })
export class ReviewCommitSyncHandler implements SyncHandler {
  readonly type = SyncOperationType.FLUSH_REVIEW_COMMITS;
  private readonly localRepository = inject(ReviewLocalRepository);
  private readonly api = inject(ReviewCommitApiService);

  async execute(payload: unknown): Promise<void> {
    if (!isUserPayload(payload)) return;
    const commits = await this.localRepository.pendingCommits(payload.userId);
    if (commits.length === 0) return;
    await firstValueFrom(this.api.commitBatch(commits));
    const acceptedIds = new Set(commits.map(commit => commit.event.eventId));
    await this.localRepository.removeOutboxEvents(payload.userId, acceptedIds);
  }
}

function isUserPayload(payload: unknown): payload is { userId: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  return 'userId' in payload && typeof payload.userId === 'string';
}
