import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SyncHandler } from '../../../core/models/sync-handler.model';
import { PlatformStoryApiService } from './platform-story-api.service';

function storyIdPayload(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null
    || !('storyId' in payload) || typeof payload.storyId !== 'string') {
    throw new Error('Invalid platform story id');
  }
  return payload.storyId;
}

@Injectable({ providedIn: 'root' })
export class PlatformStoryReadSyncHandler implements SyncHandler {
  readonly type = 'MARK_PLATFORM_STORY_READ' as const;
  private readonly api = inject(PlatformStoryApiService);

  async execute(payload: unknown): Promise<void> {
    const storyId = storyIdPayload(payload);
    await firstValueFrom(this.api.markAsRead(storyId));
  }
}

@Injectable({ providedIn: 'root' })
export class PlatformStoryQuizSyncHandler implements SyncHandler {
  readonly type = 'SAVE_PLATFORM_STORY_QUIZ' as const;
  private readonly api = inject(PlatformStoryApiService);

  async execute(payload: unknown): Promise<void> {
    const storyId = storyIdPayload(payload);
    if (typeof payload !== 'object' || payload === null
      || !('score' in payload) || typeof payload.score !== 'number') {
      throw new Error('Invalid platform story quiz synchronization payload');
    }
    await firstValueFrom(this.api.saveQuizScore(storyId, payload.score));
  }
}

@Injectable({ providedIn: 'root' })
export class PlatformStoryWordSyncHandler implements SyncHandler {
  readonly type = 'SAVE_PLATFORM_STORY_WORD' as const;
  private readonly api = inject(PlatformStoryApiService);

  async execute(payload: unknown): Promise<void> {
    const storyId = storyIdPayload(payload);
    if (typeof payload !== 'object' || payload === null
      || !('wordId' in payload) || typeof payload.wordId !== 'string') {
      throw new Error('Invalid platform story saved-word synchronization payload');
    }
    await firstValueFrom(this.api.addSavedWord(storyId, payload.wordId));
  }
}
