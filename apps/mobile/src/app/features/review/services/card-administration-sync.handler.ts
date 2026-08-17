import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { CardApiService } from '../../vault/services/card-api.service';
import { SyncOperationType } from '../models/review.model';
import { ReviewLocalRepository } from './review-local.repository';

@Injectable({ providedIn: 'root' })
export class CardAdministrationSyncHandler implements SyncHandler {
  readonly type = SyncOperationType.FLUSH_CARD_ADMINISTRATIONS;
  private readonly localRepository = inject(ReviewLocalRepository);
  private readonly api = inject(CardApiService);

  async execute(payload: unknown): Promise<void> {
    if (!isUserPayload(payload)) return;
    const pending = await this.localRepository.pendingAdministrations(payload.userId);
    const acceptedCommandIds = new Set<string>();
    try {
      for (const administration of pending) {
        await firstValueFrom(this.api.executeAdministration(administration.cardId, administration.command));
        acceptedCommandIds.add(administration.command.commandId);
      }
    } finally {
      if (acceptedCommandIds.size > 0) {
        await this.localRepository.removeAdministrationCommands(payload.userId, acceptedCommandIds);
      }
    }
  }
}

function isUserPayload(payload: unknown): payload is { userId: string } {
  return typeof payload === 'object' && payload !== null
    && 'userId' in payload && typeof payload.userId === 'string';
}
