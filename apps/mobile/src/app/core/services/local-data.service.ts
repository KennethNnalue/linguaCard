import { inject, Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { Card, Collection } from '../models/mock-data';

@Injectable({ providedIn: 'root' })
export class LocalDataService {
  private readonly storage = inject(Storage);
  private initPromise: Promise<void> | null = null;

  /** Called once at app startup; subsequent calls are no-ops. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // Add SQLite driver when running on native (graceful fallback on web)
      const { default: CordovaSQLiteDriver } = await import(
        'localforage-cordovasqlitedriver'
      );
      await this.storage.defineDriver(CordovaSQLiteDriver);
    } catch {
      // Not available on web — IndexedDB is used automatically
    }
    await this.storage.create();
  }

  // ── Cards ────────────────────────────────────────────────────
  async getCards(userId: string): Promise<Card[]> {
    await this.init();
    return (await this.storage.get(`cards:${userId}`)) ?? [];
  }

  async setCards(userId: string, cards: Card[]): Promise<void> {
    await this.init();
    await this.storage.set(`cards:${userId}`, cards);
  }

  // ── Collections ──────────────────────────────────────────────
  async getCollections(userId: string): Promise<Collection[]> {
    await this.init();
    return (await this.storage.get(`collections:${userId}`)) ?? [];
  }

  async setCollections(userId: string, collections: Collection[]): Promise<void> {
    await this.init();
    await this.storage.set(`collections:${userId}`, collections);
  }

  // ── Timestamps ───────────────────────────────────────────────
  async getLastSyncedAt(): Promise<string | null> {
    await this.init();
    return this.storage.get('last_synced_at');
  }

  async setLastSyncedAt(ts: string): Promise<void> {
    await this.init();
    await this.storage.set('last_synced_at', ts);
  }

  // ── Full user wipe ───────────────────────────────────────────
  async clearAllUserData(userId: string): Promise<void> {
    await this.init();
    await Promise.all([
      this.storage.remove(`cards:${userId}`),
      this.storage.remove(`collections:${userId}`),
    ]);
  }
}
