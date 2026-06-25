import { inject, Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { Card, Category, Collection, PlatformStory, PlatformStoryCard, Story } from '@lingua-card/shared/domain';
import type { UpsertSessionDto } from '../../features/review/services/review-session-api.service';

export interface PendingSrsRating {
  cardId: string;
  rating: number;
  reviewedAt: string;
  sessionId: string;
}

type SyncFeature = 'stories' | 'cards' | 'collections' | 'categories';

@Injectable({ providedIn: 'root' })
export class LocalDataService {
  private readonly storage = inject(Storage);
  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
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

  // ── Stories ──────────────────────────────────────────────────
  async getStories(userId: string): Promise<Story[]> {
    await this.init();
    return (await this.storage.get(`stories:${userId}`)) ?? [];
  }

  async setStories(userId: string, stories: Story[]): Promise<void> {
    await this.init();
    await this.storage.set(`stories:${userId}`, stories);
  }

  async clearStories(userId: string): Promise<void> {
    await this.init();
    await this.storage.remove(`stories:${userId}`);
  }

  // ── Platform stories (shared catalogue — keyed by story id, not user) ─────────
  async getPlatformStory(id: string): Promise<PlatformStory | null> {
    await this.init();
    return (await this.storage.get(`platform_story:${id}`)) ?? null;
  }

  async setPlatformStory(story: PlatformStory): Promise<void> {
    await this.init();
    await this.storage.set(`platform_story:${story.id}`, story);
  }

  // ── Platform stories list (Explore catalogue — keyed by native language) ──────
  async getPlatformStoriesList(nativeLang: string): Promise<PlatformStoryCard[]> {
    await this.init();
    return (await this.storage.get(`platform_stories_list:${nativeLang}`)) ?? [];
  }

  async setPlatformStoriesList(nativeLang: string, stories: PlatformStoryCard[]): Promise<void> {
    await this.init();
    await this.storage.set(`platform_stories_list:${nativeLang}`, stories);
  }

  // ── Review session history ────────────────────────────────────
  async getSessionHistory(userId: string): Promise<unknown[]> {
    await this.init();
    return (await this.storage.get(`session_history:${userId}`)) ?? [];
  }

  async setSessionHistory(userId: string, sessions: unknown[]): Promise<void> {
    await this.init();
    await this.storage.set(`session_history:${userId}`, sessions);
  }

  // ── Categories ───────────────────────────────────────────────
  async getCategories(userId: string): Promise<Category[]> {
    await this.init();
    return (await this.storage.get(`categories:${userId}`)) ?? [];
  }

  async setCategories(userId: string, categories: Category[]): Promise<void> {
    await this.init();
    await this.storage.set(`categories:${userId}`, categories);
  }

  // ── Pending sessions (buffered offline, flushed on reconnect) ────
  async getPendingSessions(userId: string): Promise<UpsertSessionDto[]> {
    await this.init();
    return (await this.storage.get(`pending_sessions:${userId}`)) ?? [];
  }

  async setPendingSessions(userId: string, sessions: UpsertSessionDto[]): Promise<void> {
    await this.init();
    await this.storage.set(`pending_sessions:${userId}`, sessions);
  }

  // ── SRS pending ratings ───────────────────────────────────────
  async getPendingSrsRatings(userId: string): Promise<PendingSrsRating[]> {
    await this.init();
    return (await this.storage.get(`srs_ratings:${userId}`)) ?? [];
  }

  async setPendingSrsRatings(userId: string, ratings: PendingSrsRating[]): Promise<void> {
    await this.init();
    await this.storage.set(`srs_ratings:${userId}`, ratings);
  }

  // ── Timestamps ───────────────────────────────────────────────
  async getLastSyncedAt(feature: SyncFeature): Promise<string | null> {
    await this.init();
    return this.storage.get(`last_synced_at:${feature}`);
  }

  async setLastSyncedAt(feature: SyncFeature, ts: string): Promise<void> {
    await this.init();
    await this.storage.set(`last_synced_at:${feature}`, ts);
  }

  // ── Full user wipe ───────────────────────────────────────────
  async clearAllUserData(userId: string): Promise<void> {
    await this.init();
    await Promise.all([
      this.storage.remove(`cards:${userId}`),
      this.storage.remove(`collections:${userId}`),
      this.storage.remove(`categories:${userId}`),
      this.storage.remove(`stories:${userId}`),
      this.storage.remove(`srs_ratings:${userId}`),
      this.storage.remove(`session_history:${userId}`),
      this.storage.remove(`pending_sessions:${userId}`),
      this.storage.remove('last_synced_at:cards'),
      this.storage.remove('last_synced_at:collections'),
      this.storage.remove('last_synced_at:categories'),
      this.storage.remove('last_synced_at:stories'),
    ]);
  }
}
