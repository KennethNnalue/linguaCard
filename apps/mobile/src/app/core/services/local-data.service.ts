import { inject, Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import {
  CardView, Category, Collection, PlatformStory, PlatformStoryCard, PodcastEpisodePlayer,
  PodcastEpisodePreparation, PodcastLibraryResponse, PodcastTopicDetail, ScheduledCard, Story,
  UserSettings, VaultView,
  UserStoryProgress,
} from '@lingua-card/shared/domain';
import type { UpsertSessionDto } from '../../features/review/services/review-session-api.service';
import type { PersistedActiveReviewSession, PersistedReviewLocalState } from '../../features/review/domain/review-persistence';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../../features/engagement/data-access/engagement-local.models';

type SyncFeature = 'stories' | 'cards' | 'collections' | 'categories' | 'vault';

export interface CachedVaultSnapshot {
  learningContextId: string;
  vault: VaultView;
  learningItems: CardView[];
  cachedAt: string;
}

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
  async getCards(userId: string): Promise<ScheduledCard[]> {
    await this.init();
    return (await this.storage.get(`cards:${userId}`)) ?? [];
  }

  async setCards(userId: string, cards: ScheduledCard[]): Promise<void> {
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

  async getVaultSnapshot(userId: string): Promise<CachedVaultSnapshot | null> {
    await this.init();
    return (await this.storage.get(`vault_v2:${userId}`)) ?? null;
  }

  async setVaultSnapshot(userId: string, snapshot: CachedVaultSnapshot): Promise<void> {
    await this.init();
    await this.storage.set(`vault_v2:${userId}`, snapshot);
  }

  async getSettings(userId: string): Promise<UserSettings | null> {
    await this.init();
    return (await this.storage.get(`settings:${userId}`)) ?? null;
  }

  async setSettings(userId: string, settings: UserSettings): Promise<void> {
    await this.init();
    await this.storage.set(`settings:${userId}`, settings);
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

  async getPlatformStoryProgress(userId: string, storyId: string): Promise<UserStoryProgress | null> {
    await this.init();
    const progress = (await this.storage.get(`platform_story_progress:${userId}`))
      ?? {};
    return progress[storyId] ?? null;
  }

  async setPlatformStoryProgress(userId: string, progress: UserStoryProgress): Promise<void> {
    await this.init();
    const key = `platform_story_progress:${userId}`;
    const existing = (await this.storage.get(key)) ?? {};
    await this.storage.set(key, { ...existing, [progress.storyId]: progress });
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

  async getPodcastLibrary(userId: string): Promise<PodcastLibraryResponse | null> {
    await this.init();
    return (await this.storage.get(`podcast_library:${userId}`)) ?? null;
  }

  async setPodcastLibrary(userId: string, library: PodcastLibraryResponse): Promise<void> {
    await this.init();
    await this.storage.set(`podcast_library:${userId}`, library);
  }

  async getPodcastTopic(topicId: string): Promise<PodcastTopicDetail | null> {
    await this.init();
    return (await this.storage.get(`podcast_topic:${topicId}`)) ?? null;
  }

  async setPodcastTopic(topic: PodcastTopicDetail): Promise<void> {
    await this.init();
    await this.storage.set(`podcast_topic:${topic.id}`, topic);
  }

  async getPodcastPreparation(userId: string, episodeId: string): Promise<PodcastEpisodePreparation | null> {
    await this.init();
    return (await this.storage.get(`podcast_preparation:${userId}:${episodeId}`)) ?? null;
  }

  async setPodcastPreparation(userId: string, preparation: PodcastEpisodePreparation): Promise<void> {
    await this.init();
    await this.storage.set(`podcast_preparation:${userId}:${preparation.episode.id}`, preparation);
  }

  async getPodcastPlayer(userId: string, episodeId: string): Promise<PodcastEpisodePlayer | null> {
    await this.init();
    return (await this.storage.get(`podcast_player:${userId}:${episodeId}`)) ?? null;
  }

  async setPodcastPlayer(userId: string, episode: PodcastEpisodePlayer): Promise<void> {
    await this.init();
    await this.storage.set(`podcast_player:${userId}:${episode.id}`, episode);
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

  async getReviewLocalState(userId: string): Promise<PersistedReviewLocalState> {
    await this.init();
    const state = await this.storage.get(`review_domain_v1:${userId}`) as PersistedReviewLocalState | null;
    if (state) {
      return { ...state, administrationOutbox: state.administrationOutbox ?? [] };
    }
    return {
      schedulingStates: {}, outbox: [], records: [], events: [], administrationOutbox: [],
    };
  }

  async setReviewLocalState(userId: string, state: PersistedReviewLocalState): Promise<void> {
    await this.init();
    await this.storage.set(`review_domain_v1:${userId}`, state);
  }

  async getEngagementState(userId: string): Promise<PersistedEngagementState> {
    await this.init();
    return (await this.storage.get(`engagement_domain_v1:${userId}`)) ?? EMPTY_ENGAGEMENT_STATE;
  }

  async setEngagementState(userId: string, state: PersistedEngagementState): Promise<void> {
    await this.init();
    await this.storage.set(`engagement_domain_v1:${userId}`, state);
  }

  async getActiveReviewSession(userId: string): Promise<PersistedActiveReviewSession | null> {
    await this.init();
    return (await this.storage.get(`active_review_session:${userId}`)) ?? null;
  }

  async setActiveReviewSession(userId: string, session: PersistedActiveReviewSession): Promise<void> {
    await this.init();
    await this.storage.set(`active_review_session:${userId}`, session);
  }

  async clearActiveReviewSession(userId: string): Promise<void> {
    await this.init();
    await this.storage.remove(`active_review_session:${userId}`);
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
      this.storage.remove(`vault_v2:${userId}`),
      this.storage.remove(`settings:${userId}`),
      this.storage.remove(`platform_story_progress:${userId}`),
      this.storage.remove(`categories:${userId}`),
      this.storage.remove(`stories:${userId}`),
      this.storage.remove(`review_domain_v1:${userId}`),
      this.storage.remove(`engagement_domain_v1:${userId}`),
      this.storage.remove(`session_history:${userId}`),
      this.storage.remove(`pending_sessions:${userId}`),
      this.storage.remove(`active_review_session:${userId}`),
      this.storage.remove(`podcast_library:${userId}`),
      this.storage.remove('last_synced_at:cards'),
      this.storage.remove('last_synced_at:collections'),
      this.storage.remove('last_synced_at:vault'),
      this.storage.remove('last_synced_at:categories'),
      this.storage.remove('last_synced_at:stories'),
    ]);
  }
}
