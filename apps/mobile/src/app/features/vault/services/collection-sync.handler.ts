import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/domain';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { CollectionApiService } from './collection-api.service';

@Injectable({ providedIn: 'root' })
export class CollectionSyncHandler implements SyncHandler {
  readonly type = 'COLLECTION' as const;
  private readonly api = inject(CollectionApiService);

  async execute(payload: unknown): Promise<void> {
    const p = payload as {
      op: 'CREATE_COLLECTION' | 'UPDATE_COLLECTION' | 'DELETE_COLLECTION';
      data: unknown;
    };
    switch (p.op) {
      case 'CREATE_COLLECTION':
        await firstValueFrom(this.api.create(p.data as CreateCollectionDto));
        break;
      case 'UPDATE_COLLECTION': {
        const { id, dto } = p.data as { id: string; dto: UpdateCollectionDto };
        await firstValueFrom(this.api.update(id, dto));
        break;
      }
      case 'DELETE_COLLECTION':
        await firstValueFrom(this.api.remove(p.data as string));
        break;
    }
  }
}
