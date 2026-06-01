import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Card } from '@lingua-card/shared/domain';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { CardApiService } from './card-api.service';

@Injectable({ providedIn: 'root' })
export class CardSyncHandler implements SyncHandler {
  readonly type = 'CARD' as const;
  private readonly api = inject(CardApiService);

  async execute(payload: unknown): Promise<void> {
    const p = payload as { op: 'CREATE_CARD' | 'UPDATE_CARD' | 'DELETE_CARD'; data: unknown };
    switch (p.op) {
      case 'CREATE_CARD':
        await firstValueFrom(this.api.create(p.data as Omit<Card, 'id'>));
        break;
      case 'UPDATE_CARD': {
        const { id, patch } = p.data as { id: string; patch: Partial<Card> };
        await firstValueFrom(this.api.update(id, patch));
        break;
      }
      case 'DELETE_CARD':
        await firstValueFrom(this.api.remove(p.data as string));
        break;
    }
  }
}
