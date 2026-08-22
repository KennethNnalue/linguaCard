import { inject, Injectable } from '@angular/core';
import {
  applyCardAdministration,
  CardAdministrationCommand,
  CardAdministrationResult,
  CardAdministrationType,
  ScheduledCard,
} from '@lingua-card/shared/domain';
import { generateUuid } from '@lingua-card/shared/utils';
import { CardStore } from '../../vault/store/card.store';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';
import { SyncOperationType } from '../models/review.model';
import { ReviewLocalRepository } from './review-local.repository';

@Injectable({ providedIn: 'root' })
export class CardAdministrationService {
  private readonly cards = inject(CardStore);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly localRepository = inject(ReviewLocalRepository);

  manuallyMaster(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: generateUuid(), type: CardAdministrationType.MANUALLY_MASTER });
  }

  undoManualMastery(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: generateUuid(), type: CardAdministrationType.UNDO_MANUAL_MASTERY });
  }

  scheduleLeechRest(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: generateUuid(), type: CardAdministrationType.SCHEDULE_LEECH_REST });
  }

  resetProgress(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, {
      commandId: generateUuid(),
      type: CardAdministrationType.RESET_PROGRESS,
      confirmHistoryRetention: true,
    });
  }

  private async execute(card: ScheduledCard, command: CardAdministrationCommand): Promise<CardAdministrationResult> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) throw new Error('A signed-in user is required to administer a card');
    const result = applyCardAdministration(card.reviewState, command, new Date(), generateUuid());
    await this.localRepository.administer(userId, { cardId: card.id, command }, result.nextState);
    this.cards.updateCard({ ...card, reviewState: result.nextState });
    try {
      await this.sync.enqueue({ type: SyncOperationType.FLUSH_CARD_ADMINISTRATIONS, payload: { userId } });
      if (navigator.onLine) void this.sync.processQueue();
    } catch {
      // The durable administration outbox is checked again during app initialization.
    }
    return result;
  }
}
