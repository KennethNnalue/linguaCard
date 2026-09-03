import { computed, effect, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { GenerateStoryDto, Story } from '@lingua-card/shared/domain';
import { StoryApiService } from '../services/story-api.service';
import { PlatformStoryApiService } from '../services/platform-story-api.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { SyncService } from '../../../core/services/sync.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { AuthService } from '../../../core/services/auth.service';

interface StoryState {
  stories: Story[];
  isLoading: boolean;
  isRefreshing: boolean;
  isGenerating: boolean;
  error: string | null;
  generateError: string | null;
  hasEverLoaded: boolean;
  extendingId: string | null;
  extendError: string | null;
  /** Client-only: storyId → ISO timestamp of when it was last opened in the
   *  reader. Powers the "Continue reading" hero (reading isn't a server event). */
  lastOpenedAt: Record<string, string>;
}

const LAST_OPENED_KEY = 'lc-story-last-opened';

function loadLastOpened(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_OPENED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const initialState: StoryState = {
  stories: [],
  isLoading: false,
  isRefreshing: false,
  isGenerating: false,
  error: null,
  generateError: null,
  hasEverLoaded: false,
  extendingId: null,
  extendError: null,
  lastOpenedAt: loadLastOpened(),
};

export const StoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ stories }) => ({
    sortedStories: computed(() =>
      [...stories()].sort(
        (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      )
    ),
    totalCount: computed(() => stories().length),
    incompleteStories: computed(() =>
      stories().filter(s => s.generationStatus === 'partial')
    ),
  })),

  withMethods((store) => {
    const api = inject(StoryApiService);
    const platformApi = inject(PlatformStoryApiService);
    const audioCache = inject(AiAudioCacheService);
    const syncService = inject(SyncService);
    const localData = inject(LocalDataService);
    const authService = inject(AuthService);

    function uid(): string | undefined {
      return authService.currentUser()?.id;
    }

    return {
      loadStories(): void {
        void (async () => {
          const userId = uid();

          if (userId) {
            try {
              const cached = await localData.getStories(userId);
              if (cached.length > 0) {
                patchState(store, { stories: cached, hasEverLoaded: true });
              }
            } catch {
              patchState(store, { error: 'Stories saved on this device could not be read.' });
            }
          }

          if (!navigator.onLine) {
            patchState(store, {
              isLoading: false,
              isRefreshing: false,
              error: store.hasEverLoaded() ? null : 'No stories are saved on this device yet.',
            });
            return;
          }

          if (!store.hasEverLoaded()) {
            patchState(store, { isLoading: true, error: null });
          } else {
            patchState(store, { isRefreshing: true });
          }

          try {
            const stories = await firstValueFrom(api.getAll());
            patchState(store, {
              stories,
              isLoading: false,
              isRefreshing: false,
              hasEverLoaded: true,
            });
            if (userId) await localData.setStories(userId, stories);
            await localData.setLastSyncedAt('stories', new Date().toISOString());
          } catch {
            patchState(store, { isLoading: false, isRefreshing: false });
            if (!store.hasEverLoaded()) {
              patchState(store, { error: 'Could not load stories. Check your connection.' });
            }
          }
        })();
      },

      setStoriesFromSync(stories: Story[]): void {
        patchState(store, { stories, hasEverLoaded: true });
      },

      /**
       * Resolve once the user's story list is available, fetching it if the store
       * was never populated (e.g. the reader was opened via deep link without first
       * visiting the library). Needed so the player can build a full cross-story
       * queue instead of a single-item one. No-op if stories are already loaded.
       */
      async ensureLoaded(): Promise<void> {
        if (store.hasEverLoaded() || store.stories().length > 0) return;
        const userId = uid();
        if (userId) {
          try {
            const cached = await localData.getStories(userId);
            if (cached.length > 0) {
              patchState(store, { stories: cached, hasEverLoaded: true });
              return;
            }
          } catch {
            if (!navigator.onLine) return;
          }
        }
        if (!navigator.onLine) return;
        try {
          const stories = await firstValueFrom(api.getAll());
          patchState(store, { stories, hasEverLoaded: true });
          if (userId) await localData.setStories(userId, stories);
        } catch {
          // Leave the store empty — caller falls back to a single-item queue.
        }
      },

      async generateStory(dto: GenerateStoryDto): Promise<Story | null> {
        patchState(store, { isGenerating: true, generateError: null });
        try {
          const story = await firstValueFrom(api.generate(dto));
          patchState(store, {
            stories: [story, ...store.stories()],
            isGenerating: false,
          });
          return story;
        } catch (err: unknown) {
          const isNetworkError =
            err instanceof TypeError ||
            (err as { status?: number })?.status === 0;
          if (isNetworkError) {
            void syncService.enqueue({ type: 'GENERATE_STORY', payload: dto });
          }
          patchState(store, {
            isGenerating: false,
            generateError: isNetworkError
              ? 'No internet connection. Your request has been queued.'
              : 'Story generation failed. Please try again.',
          });
          return null;
        }
      },

      addStory(story: Story): void {
        patchState(store, { stories: [story, ...store.stories()] });
      },

      /**
       * Adopt a platform story into the user's own stories ("Add to my stories").
       * Idempotent server-side; locally we upsert the returned story so it appears
       * in My Stories and becomes queueable in the StoryPlayerService playlist.
       * Returns the adopted Story, or null on failure.
       */
      async adoptPlatformStory(platformStoryId: string): Promise<Story | null> {
        try {
          const result = await firstValueFrom(platformApi.adopt(platformStoryId));
          const story = result.story;
          const without = store.stories().filter(s => s.id !== story.id);
          const next = [story, ...without];
          patchState(store, { stories: next });
          const userId = uid();
          if (userId) await localData.setStories(userId, next);
          return story;
        } catch {
          return null;
        }
      },

      getById(id: string): Story | null {
        return store.stories().find(s => s.id === id) ?? null;
      },

      /** Stamp a story as the most recently opened (for the Continue-reading hero).
       *  Local-only — reading a story is not a server-tracked event. */
      recordStoryOpened(id: string): void {
        const next = { ...store.lastOpenedAt(), [id]: new Date().toISOString() };
        patchState(store, { lastOpenedAt: next });
        try {
          localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(next));
        } catch {
          /* storage full / unavailable — hero just falls back to other signals */
        }
      },

      incrementListenCount(id: string): void {
        const stories = store.stories().map(s =>
            s.id === id
              ? { ...s, listenCount: s.listenCount + 1, lastListenedAt: new Date().toISOString() }
              : s
          );
        patchState(store, { stories });
        const userId = uid();
        if (userId) void localData.setStories(userId, stories).catch(() => undefined);
        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'RECORD_STORY_LISTEN', payload: { storyId: id } });
          return;
        }
        void firstValueFrom(api.recordListen(id)).catch(() =>
          syncService.enqueue({ type: 'RECORD_STORY_LISTEN', payload: { storyId: id } })
        );
      },

      async setLearned(id: string, isLearned: boolean): Promise<Story | null> {
        const current = store.stories().find(story => story.id === id);
        if (!current) return null;
        const optimistic = { ...current, isLearned };
        const stories = store.stories().map(story => story.id === id ? optimistic : story);
        patchState(store, { stories });
        const userId = uid();
        if (userId) await localData.setStories(userId, stories);
        if (!navigator.onLine) {
          await syncService.enqueue({ type: 'MARK_STORY_LEARNED', payload: { storyId: id, isLearned } });
          return optimistic;
        }
        try {
          const saved = await firstValueFrom(api.markLearned(id, isLearned));
          const reconciled = store.stories().map(story => story.id === id ? saved : story);
          patchState(store, { stories: reconciled });
          if (userId) await localData.setStories(userId, reconciled);
          return saved;
        } catch {
          await syncService.enqueue({ type: 'MARK_STORY_LEARNED', payload: { storyId: id, isLearned } });
          return optimistic;
        }
      },

      /**
       * Flag a story's cached audio as missing (e.g. its file 404'd). Clears the
       * local `audioUrl` so the next open re-generates it, and evicts any stale
       * cached copy. Local-only — no server write (the file is already gone).
       */
      markAudioMissing(id: string): void {
        const stories = store.stories().map(s => (s.id === id ? { ...s, audioUrl: null } : s));
        patchState(store, { stories });
        const userId = uid();
        if (userId) void localData.setStories(userId, stories).catch(() => undefined);
        void audioCache.evict(id);
      },

      async generateAudio(id: string): Promise<Story | null> {
        try {
          const story = await firstValueFrom(api.generateAudio(id));
          patchState(store, {
            stories: store.stories().map(s => (s.id === id ? story : s)),
          });
          return story;
        } catch {
          return null;
        }
      },

      async enrichStory(id: string): Promise<Story | null> {
        try {
          const story = await firstValueFrom(api.enrich(id));
          patchState(store, {
            stories: store.stories().map(s => (s.id === id ? story : s)),
          });
          return story;
        } catch {
          return null;
        }
      },

      deleteStory(id: string): void {
        const next = store.stories().filter(s => s.id !== id);
        patchState(store, { stories: next });
        void audioCache.evict(id);

        const userId = uid();
        if (userId) void localData.setStories(userId, next);

        if (!navigator.onLine) {
          void syncService.enqueue({ type: 'DELETE_STORY', payload: { storyId: id } });
          return;
        }
        void firstValueFrom(api.remove(id)).catch(() => {
          void syncService.enqueue({ type: 'DELETE_STORY', payload: { storyId: id } });
        });
      },

      extendStory(id: string): void {
        void (async () => {
          patchState(store, { extendingId: id, extendError: null });
          try {
            const extended = await firstValueFrom(api.extend(id));
            patchState(store, {
              stories: store.stories().map(s => s.id === id ? extended : s),
              extendingId: null,
            });
            const userId = uid();
            if (userId) {
              await localData.setStories(userId, store.stories());
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Extension failed';
            patchState(store, { extendingId: null, extendError: msg });
          }
        })();
      },

      clearGenerateError(): void {
        patchState(store, { generateError: null });
      },

      reset(): void {
        patchState(store, initialState);
      },
    };
  }),
  withHooks(store => {
    const auth = inject(AuthService);
    let activeUserId = auth.currentUser()?.id;
    return {
      onInit(): void {
        effect(() => {
          const nextUserId = auth.currentUser()?.id;
          if (nextUserId === activeUserId) return;
          activeUserId = nextUserId;
          store.reset();
          if (nextUserId) store.loadStories();
        });
      },
    };
  }),
);
