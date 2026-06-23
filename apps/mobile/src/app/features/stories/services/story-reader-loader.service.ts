import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Story } from '@lingua-card/shared/domain';
import { StoryStore } from '../store/story.store';
import { StoryApiService } from './story-api.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';

/** Progress callbacks so the reader page keeps owning its banner render state. */
export interface StoryLoadHandlers {
  onAudioGenerating(active: boolean): void;
  onAudioLoading(active: boolean): void;
}

export interface StoryLoadResult {
  /** The story with its audio URL resolved to a playable (possibly cached) URL. */
  story: Story;
  /** Whether a usable audio URL is available. */
  hasAudio: boolean;
  /** Whether quiz/keywords/grammar should be auto-enriched. */
  needsEnrichment: boolean;
}

/**
 * Orchestrates the user-story reader's load pipeline: resolve the story from the
 * store (or API), generate audio if missing, and resolve the audio URL through
 * the offline cache. Keeps this multi-step sequencing out of the page so the page
 * only renders and handles events.
 *
 * Returns `null` when the story can't be loaded (caller navigates away). Banner
 * UI state is reported via {@link StoryLoadHandlers} so it stays page-owned.
 */
@Injectable({ providedIn: 'root' })
export class StoryReaderLoaderService {
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);
  private readonly aiAudioCache = inject(AiAudioCacheService);

  async load(id: string, handlers: StoryLoadHandlers): Promise<StoryLoadResult | null> {
    let story = this.storyStore.getById(id);
    if (!story) {
      try {
        story = await firstValueFrom(this.api.getById(id));
      } catch {
        return null;
      }
    }

    if (!story.audioUrl) {
      handlers.onAudioGenerating(true);
      const generated = await this.storyStore.generateAudio(story.id);
      handlers.onAudioGenerating(false);
      if (!generated) return null;
      story = generated;
    }

    handlers.onAudioLoading(true);
    const resolvedUrl = await this.aiAudioCache.getOrDownload(story.id, story.audioUrl);
    handlers.onAudioLoading(false);

    const resolved: Story = { ...story, audioUrl: resolvedUrl };
    return {
      story: resolved,
      hasAudio: !!resolvedUrl,
      needsEnrichment: this.needsEnrichment(resolved),
    };
  }

  /** Auto-enrich when the story has sentences but is missing quiz/grammar/keywords. */
  private needsEnrichment(s: Story): boolean {
    return (
      s.sentences?.length > 0 &&
      (
        (s.quizQuestions ?? []).length === 0 ||
        (s.grammarNotes ?? []).length === 0 ||
        (s.keywords ?? []).length === 0
      )
    );
  }
}
