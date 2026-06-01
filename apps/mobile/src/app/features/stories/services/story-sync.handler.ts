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
