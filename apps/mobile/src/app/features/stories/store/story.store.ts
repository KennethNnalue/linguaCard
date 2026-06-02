import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { GenerateStoryDto, Story } from '@lingua-card/shared/domain';
import { StoryApiService } from '../services/story-api.service';
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

          // 1. Show cache immediately — zero delay to user
          if (userId) {
            const cached = await localData.getStories(userId);
            if (cached.length > 0) {
              patchState(store, { stories: cached, hasEverLoaded: true });
            }
          }

          // 2. Determine whether to block (no cache) or silently refresh
          if (!store.hasEverLoaded()) {
            patchState(store, { isLoading: true, error: null });
          } else {
            patchState(store, { isRefreshing: true });
          }

          // 3. Background network refresh
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

      getById(id: string): Story | null {
        return store.stories().find(s => s.id === id) ?? null;
      },

      incrementListenCount(id: string): void {
        patchState(store, {
          stories: store.stories().map(s =>
            s.id === id
              ? { ...s, listenCount: s.listenCount + 1, lastListenedAt: new Date().toISOString() }
              : s
          ),
        });
        void firstValueFrom(api.recordListen(id)).catch(() => null);
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
  })
);
