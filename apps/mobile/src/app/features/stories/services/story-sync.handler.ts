import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GenerateStoryDto } from '@lingua-card/shared/domain';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { StoryApiService } from './story-api.service';
import { StoryStore } from '../store/story.store';

@Injectable({ providedIn: 'root' })
export class StorySyncHandler implements SyncHandler {
  readonly type = 'GENERATE_STORY' as const;

  private readonly api = inject(StoryApiService);
  private readonly storyStore = inject(StoryStore);

  async execute(payload: unknown): Promise<void> {
    const story = await firstValueFrom(this.api.generate(payload as GenerateStoryDto));
    this.storyStore.addStory(story);
  }
}

@Injectable({ providedIn: 'root' })
export class StoryDeleteSyncHandler implements SyncHandler {
  readonly type = 'DELETE_STORY' as const;

  private readonly api = inject(StoryApiService);

  async execute(payload: unknown): Promise<void> {
    const { storyId } = payload as { storyId: string };
    try {
      await firstValueFrom(this.api.remove(storyId));
    } catch (err: unknown) {
      // 404 means already gone — silently dequeue
      if ((err as { status?: number })?.status === 404) return;
      throw err;
    }
  }
}

function storyLearnedPayload(payload: unknown): { storyId: string; isLearned: boolean } {
  if (typeof payload !== 'object' || payload === null
    || !('storyId' in payload) || typeof payload.storyId !== 'string'
    || !('isLearned' in payload) || typeof payload.isLearned !== 'boolean') {
    throw new Error('Invalid story learned synchronization payload');
  }
  return { storyId: payload.storyId, isLearned: payload.isLearned };
}

function storyIdPayload(payload: unknown): { storyId: string } {
  if (typeof payload !== 'object' || payload === null
    || !('storyId' in payload) || typeof payload.storyId !== 'string') {
    throw new Error('Invalid story synchronization payload');
  }
  return { storyId: payload.storyId };
}

@Injectable({ providedIn: 'root' })
export class StoryLearnedSyncHandler implements SyncHandler {
  readonly type = 'MARK_STORY_LEARNED' as const;
  private readonly api = inject(StoryApiService);

  async execute(payload: unknown): Promise<void> {
    const { storyId, isLearned } = storyLearnedPayload(payload);
    await firstValueFrom(this.api.markLearned(storyId, isLearned));
  }
}

@Injectable({ providedIn: 'root' })
export class StoryListenSyncHandler implements SyncHandler {
  readonly type = 'RECORD_STORY_LISTEN' as const;
  private readonly api = inject(StoryApiService);

  async execute(payload: unknown): Promise<void> {
    const { storyId } = storyIdPayload(payload);
    await firstValueFrom(this.api.recordListen(storyId));
  }
}
