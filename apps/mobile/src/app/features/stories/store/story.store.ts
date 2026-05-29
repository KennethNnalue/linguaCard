import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { GenerateStoryDto, Story } from '../../../core/models/mock-data';
import { StoryApiService } from '../services/story-api.service';

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
        } catch {
          patchState(store, {
            isGenerating: false,
            generateError: 'Story generation failed. Please try again.',
          });
          return null;
        }
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

      deleteStory(id: string): void {
        patchState(store, { stories: store.stories().filter(s => s.id !== id) });
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
