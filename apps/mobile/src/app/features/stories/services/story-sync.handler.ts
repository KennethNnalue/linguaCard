import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GenerateStoryDto } from '@lingua-card/shared/domain';
import { SyncService } from '../../../core/services/sync.service';
import { StoryApiService } from './story-api.service';
import { StoryStore } from '../store/story.store';

@Injectable({ providedIn: 'root' })
export class StorySyncHandler {
  readonly type = 'GENERATE_STORY' as const;

  private readonly api = inject(StoryApiService);
  private readonly storyStore = inject(StoryStore);
  private readonly syncService = inject(SyncService);

  async execute(payload: GenerateStoryDto): Promise<void> {
    const story = await firstValueFrom(this.api.generate(payload));
    // Add generated story into the store on successful retry
    this.storyStore.addStory(story);
  }

  async enqueueGenerate(dto: GenerateStoryDto): Promise<void> {
    await this.syncService.enqueue({ type: this.type, payload: dto });
  }
}
