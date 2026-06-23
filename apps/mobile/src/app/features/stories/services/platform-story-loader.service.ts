import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PlatformStory, UserStoryProgress } from '@lingua-card/shared/domain';
import { PlatformStoryApiService } from './platform-story-api.service';

export interface PlatformStoryLoadResult {
  story: PlatformStory;
  progress: UserStoryProgress | null;
}

/**
 * Orchestrates the platform-story reader's load pipeline: fetch the story, mark
 * it as read, and load the user's progress — keeping this off the page. Returns
 * `null` when the story can't be loaded (caller navigates away).
 */
@Injectable({ providedIn: 'root' })
export class PlatformStoryLoaderService {
  private readonly api = inject(PlatformStoryApiService);

  async load(id: string): Promise<PlatformStoryLoadResult | null> {
    let story: PlatformStory;
    try {
      story = await firstValueFrom(this.api.getById(id));
    } catch {
      return null;
    }

    // Fire-and-forget read marker; progress is awaited so the page can render it.
    this.api.markAsRead(id).subscribe({ error: () => undefined });

    let progress: UserStoryProgress | null = null;
    try {
      progress = await firstValueFrom(this.api.getProgress(id));
    } catch {
      progress = null;
    }

    return { story, progress };
  }
}
