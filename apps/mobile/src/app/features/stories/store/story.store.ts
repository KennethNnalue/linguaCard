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

interface StoryState {
  stories: Story[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generateError: string | null;
}

const initialState: StoryState = {
  stories: [],
  isLoading: false,
  isGenerating: false,
  error: null,
  generateError: null,
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
  })),

  withMethods((store) => {
    const api = inject(StoryApiService);
    const audioCache = inject(AiAudioCacheService);
    const syncService = inject(SyncService);

    return {
      loadStories(): void {
        void (async () => {
          patchState(store, { isLoading: true, error: null });
          try {
            const stories = await firstValueFrom(api.getAll());
            patchState(store, { stories, isLoading: false });
          } catch {
            patchState(store, { isLoading: false, error: 'Failed to load stories' });
          }
        })();
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
          // Queue for retry if this looks like a network error
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

      deleteStory(id: string): void {
        patchState(store, { stories: store.stories().filter(s => s.id !== id) });
        void audioCache.evict(id);
        void firstValueFrom(api.remove(id)).catch(() => null);
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
