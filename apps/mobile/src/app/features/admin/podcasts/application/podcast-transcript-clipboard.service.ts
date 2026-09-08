import { inject, Injectable } from '@angular/core';
import type {
  AdminPodcastTranscriptPromptResult,
  AdminPodcastVocabularySelection,
} from '@lingua-card/shared/domain';
import { firstValueFrom } from 'rxjs';
import { AdminPodcastApiService } from '../data-access/admin-podcast-api.service';

@Injectable({ providedIn: 'root' })
export class PodcastTranscriptClipboardService {
  private readonly api = inject(AdminPodcastApiService);

  async copy(
    episodeId: string,
    vocabulary: string[],
    direction?: string,
    resolutions?: AdminPodcastVocabularySelection[],
  ): Promise<AdminPodcastTranscriptPromptResult> {
    const result = await firstValueFrom(
      this.api.createTranscriptPrompt(episodeId, vocabulary, direction, resolutions),
    );
    if (result.status === 'needs_resolution') return result;
    await navigator.clipboard.writeText(result.prompt);
    return result;
  }
}
