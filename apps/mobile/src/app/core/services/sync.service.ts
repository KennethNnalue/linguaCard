import { computed, inject, Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { firstValueFrom } from 'rxjs';
import { SyncStatus, Card, Collection, CreateCollectionDto, UpdateCollectionDto } from '../models/mock-data';
import { CardApiService } from './card-api.service';
import { CollectionApiService } from './collection-api.service';
import { LocalDataService } from './local-data.service';
import { AuthService } from './auth.service';

export type SyncOperationType =
  | 'CREATE_CARD'
  | 'UPDATE_CARD'
  | 'DELETE_CARD'
  | 'CREATE_COLLECTION'
  | 'UPDATE_COLLECTION'
  | 'DELETE_COLLECTION';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
}

const QUEUE_KEY = 'lc_sync_queue';
const MAX_RETRIES = 5;

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly cardApi = inject(CardApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly authService = inject(AuthService);

  private readonly _status = signal<SyncStatus>('synced');
  private readonly _queue = signal<SyncOperation[]>([]);

  readonly syncStatus = this._status.asReadonly();
  readonly pendingCount = computed(
    () => this._queue().filter((op) => op.status === 'pending').length
  );

  async init(): Promise<void> {
    // Restore persisted queue
    const { value } = await Preferences.get({ key: QUEUE_KEY });
    if (value) {
      try {
        const saved = JSON.parse(value) as SyncOperation[];
        const pending = saved.filter((op) => op.status !== 'failed');
        this._queue.set(pending);
        if (pending.length > 0) this._status.set('pending');
      } catch {
        /* corrupt — start fresh */
      }
    }

    // Process queue whenever connectivity is restored
    await Network.addListener('networkStatusChange', async (status) => {
      if (status.connected && this._queue().length > 0) {
        await this.processQueue();
      }
    });
  }

  async enqueue(
    op: Pick<SyncOperation, 'type' | 'payload'>
  ): Promise<void> {
    const full: SyncOperation = {
      ...op,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };
    const queue = [...this._queue(), full];
    this._queue.set(queue);
    this._status.set('pending');
    await this.persistQueue(queue);
  }

  async dequeue(id: string): Promise<void> {
    const queue = this._queue().filter((op) => op.id !== id);
    this._queue.set(queue);
    this._status.set(queue.length === 0 ? 'synced' : 'pending');
    await this.persistQueue(queue);
  }

  async processQueue(): Promise<void> {
    const ops = this._queue().filter((op) => op.status === 'pending');
    if (ops.length === 0) return;

    this._status.set('syncing');

    for (const op of ops) {
      try {
        await this.execute(op);
        await this.dequeue(op.id);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        const next = this._queue().map((q) =>
          q.id === op.id
            ? {
                ...q,
                retryCount: q.retryCount + 1,
                status:
                  q.retryCount + 1 >= MAX_RETRIES
                    ? ('failed' as const)
                    : ('pending' as const),
              }
            : q
        );
        this._queue.set(next);
        await this.persistQueue(next);
      }
    }

    const hasFailed = this._queue().some((op) => op.status === 'failed');
    const hasPending = this._queue().some((op) => op.status === 'pending');
    this._status.set(hasFailed ? 'error' : hasPending ? 'pending' : 'synced');
  }

  /** Pull latest server state and process pending queue. */
  async forceSync(): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    this._status.set('syncing');
    try {
      await this.processQueue();
      const cards = await firstValueFrom(this.cardApi.getAll());
      await this.localData.setCards(userId, cards);
      await this.localData.setLastSyncedAt(new Date().toISOString());
      this._status.set('synced');
    } catch {
      this._status.set('error');
    }
  }

  private async execute(op: SyncOperation): Promise<void> {
    switch (op.type) {
      case 'CREATE_CARD':
        await firstValueFrom(this.cardApi.create(op.payload as Omit<Card, 'id'>));
        break;
      case 'UPDATE_CARD': {
        const { id, patch } = op.payload as { id: string; patch: Partial<Card> };
        await firstValueFrom(this.cardApi.update(id, patch));
        break;
      }
      case 'DELETE_CARD':
        await firstValueFrom(this.cardApi.remove(op.payload as string));
        break;
      case 'CREATE_COLLECTION':
        await firstValueFrom(this.collectionApi.create(op.payload as CreateCollectionDto));
        break;
      case 'UPDATE_COLLECTION': {
        const { id, dto } = op.payload as { id: string; dto: UpdateCollectionDto };
        await firstValueFrom(this.collectionApi.update(id, dto));
        break;
      }
      case 'DELETE_COLLECTION':
        await firstValueFrom(this.collectionApi.remove(op.payload as string));
        break;
    }
  }

  private async persistQueue(queue: SyncOperation[]): Promise<void> {
    await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
  }
}
