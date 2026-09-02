import { computed, inject, Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { SyncStatus } from '@lingua-card/shared/domain';
import { generateUuid } from '@lingua-card/shared/utils';
import type { SyncHandler } from '../models/sync-handler.model';
import type { DataRefresher } from '../models/data-refresher.model';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export type SyncOperationType =
  | 'CREATE_CARD'
  | 'UPDATE_CARD'
  | 'DELETE_CARD'
  | 'CREATE_COLLECTION'
  | 'UPDATE_COLLECTION'
  | 'DELETE_COLLECTION'
  | 'GENERATE_STORY'
  | 'DELETE_STORY'
  | 'FLUSH_REVIEW_COMMITS'
  | 'FLUSH_REVIEW_SESSIONS'
  | 'FLUSH_CARD_ADMINISTRATIONS'
  | 'PATCH_SETTINGS';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
  nextRetryAt: string | null;
}

export interface SyncResult {
  success: boolean;
  failedFeatures: string[];
  flushedCount: number;
  ts: string;
}

const QUEUE_KEY = environment.production
  ? 'lc_sync_queue'
  : `lc_sync_queue:${environment.storageNamespace}`;
const MAX_RETRIES = 5;
const DEBOUNCE_MS = 10_000;

function backoffMs(retryCount: number): number {
  const delays = [5_000, 15_000, 60_000, 300_000];
  const base = delays[Math.min(retryCount, delays.length - 1)];
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return Math.round(base + jitter);
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly authService = inject(AuthService);

  private readonly handlers = new Map<string, SyncHandler>();
  private readonly refreshers = new Map<string, DataRefresher>();

  private readonly _status = signal<SyncStatus>('synced');
  private readonly _queue = signal<SyncOperation[]>([]);
  private readonly _lastSyncResult = signal<SyncResult | null>(null);
  private _lastForceSyncAt = 0;

  readonly syncStatus = this._status.asReadonly();
  readonly lastSyncResult = this._lastSyncResult.asReadonly();
  readonly pendingCount = computed(
    () => this._queue().filter((op) => op.status === 'pending').length
  );

  /**
   * Payloads of queued ops of a given type that haven't permanently failed.
   * Lets a refresher re-apply still-pending local edits on top of a server
   * response so a refresh never visually reverts an edit awaiting sync.
   */
  pendingPayloads(type: SyncOperationType): unknown[] {
    return this._queue()
      .filter((op) => op.type === type && op.status !== 'failed')
      .map((op) => op.payload);
  }

  registerHandler(handler: SyncHandler): void {
    this.handlers.set(handler.type, handler);
  }

  registerRefresher(refresher: DataRefresher): void {
    this.refreshers.set(refresher.name, refresher);
  }

  async init(): Promise<void> {
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

    await Network.addListener('networkStatusChange', async (status) => {
      if (status.connected && this._queue().length > 0) {
        await this.processQueue();
      }
    });
  }

  async enqueue(op: Pick<SyncOperation, 'type' | 'payload'>): Promise<void> {
    const full: SyncOperation = {
      ...op,
      id: generateUuid(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      nextRetryAt: null,
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

  async processQueue(): Promise<number> {
    const now = new Date();
    const ops = this._queue().filter(
      (op) =>
        op.status === 'pending' &&
        (!op.nextRetryAt || new Date(op.nextRetryAt) <= now)
    );
    if (ops.length === 0) return 0;

    this._status.set('syncing');
    let flushedCount = 0;

    for (const op of ops) {
      try {
        await this.execute(op);
        await this.dequeue(op.id);
        flushedCount++;
      } catch {
        const nextRetry = backoffMs(op.retryCount);
        const next = this._queue().map((q) =>
          q.id === op.id
            ? {
                ...q,
                retryCount: q.retryCount + 1,
                status:
                  q.retryCount + 1 >= MAX_RETRIES
                    ? ('failed' as const)
                    : ('pending' as const),
                nextRetryAt:
                  q.retryCount + 1 < MAX_RETRIES
                    ? new Date(Date.now() + nextRetry).toISOString()
                    : null,
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
    return flushedCount;
  }

  async forceSync(): Promise<SyncResult> {
    const now = Date.now();
    if (now - this._lastForceSyncAt < DEBOUNCE_MS) {
      return this._lastSyncResult() ?? { success: true, failedFeatures: [], flushedCount: 0, ts: new Date().toISOString() };
    }
    this._lastForceSyncAt = now;

    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, failedFeatures: [], flushedCount: 0, ts: new Date().toISOString() };

    this._status.set('syncing');
    const errors: string[] = [];

    const flushedCount = await this.processQueue();

    await Promise.allSettled(
      [...this.refreshers.values()].map(async (refresher) => {
        try {
          await refresher.refresh(userId);
        } catch (err) {
          errors.push(refresher.name);
          console.error(`[SyncService] ${refresher.name} refresh failed`, err);
        }
      })
    );

    const success = errors.length === 0;
    this._status.set(success ? 'synced' : 'error');
    const result: SyncResult = {
      success,
      failedFeatures: errors,
      flushedCount,
      ts: new Date().toISOString(),
    };
    this._lastSyncResult.set(result);
    return result;
  }

  startPeriodicSync(): void {
    setInterval(async () => {
      if (navigator.onLine && !document.hidden) {
        await this.forceSync();
      }
    }, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && navigator.onLine) {
        await this.forceSync();
      }
    });
  }

  private async execute(op: SyncOperation): Promise<void> {
    // Map legacy operation type strings to handler keys
    const handlerKey = this.resolveHandlerKey(op.type);
    const handler = this.handlers.get(handlerKey);
    if (!handler) {
      console.warn(`[SyncService] No handler for type "${op.type}" — skipping`);
      return;
    }
    await handler.execute(this.resolvePayload(op));
  }

  private resolveHandlerKey(type: SyncOperationType): string {
    if (type === 'CREATE_CARD' || type === 'UPDATE_CARD' || type === 'DELETE_CARD') return 'CARD';
    if (type === 'CREATE_COLLECTION' || type === 'UPDATE_COLLECTION' || type === 'DELETE_COLLECTION') return 'COLLECTION';
    return type;
  }

  /** Wrap legacy flat payloads into the { op, data } shape handlers expect. */
  private resolvePayload(op: SyncOperation): unknown {
    switch (op.type) {
      case 'CREATE_CARD':
        return { op: 'CREATE_CARD', data: op.payload };
      case 'UPDATE_CARD':
        return { op: 'UPDATE_CARD', data: op.payload };
      case 'DELETE_CARD':
        return { op: 'DELETE_CARD', data: op.payload };
      case 'CREATE_COLLECTION':
        return { op: 'CREATE_COLLECTION', data: op.payload };
      case 'UPDATE_COLLECTION':
        return { op: 'UPDATE_COLLECTION', data: op.payload };
      case 'DELETE_COLLECTION':
        return { op: 'DELETE_COLLECTION', data: op.payload };
      default:
        return op.payload;
    }
  }

  private async persistQueue(queue: SyncOperation[]): Promise<void> {
    await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
  }
}
