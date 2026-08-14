import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CardAdministrationCommand,
  CardAdministrationResult,
  CardAdministrationType,
  ScheduledCard,
} from '@lingua-card/shared/domain';
import { CardApiService } from '../../vault/services/card-api.service';
import { CardStore } from '../../vault/store/card.store';

@Injectable({ providedIn: 'root' })
export class CardAdministrationService {
  private readonly api = inject(CardApiService);
  private readonly cards = inject(CardStore);

  manuallyMaster(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: crypto.randomUUID(), type: CardAdministrationType.MANUALLY_MASTER });
  }

  undoManualMastery(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: crypto.randomUUID(), type: CardAdministrationType.UNDO_MANUAL_MASTERY });
  }

  scheduleLeechRest(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, { commandId: crypto.randomUUID(), type: CardAdministrationType.SCHEDULE_LEECH_REST });
  }

  resetProgress(card: ScheduledCard): Promise<CardAdministrationResult> {
    return this.execute(card, {
      commandId: crypto.randomUUID(),
      type: CardAdministrationType.RESET_PROGRESS,
      confirmHistoryRetention: true,
    });
  }

  private async execute(card: ScheduledCard, command: CardAdministrationCommand): Promise<CardAdministrationResult> {
    const result = await firstValueFrom(this.api.executeAdministration(card.id, command));
    this.cards.updateCard({ ...card, reviewState: result.nextState });
    return result;
  }
}
