import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminPodcastApiService } from '../data-access/admin-podcast-api.service';

@Injectable({ providedIn: 'root' })
export class PodcastTranscriptClipboardService {
  private readonly api = inject(AdminPodcastApiService);

  async copy(episodeId: string, vocabulary: string[]): Promise<void> {
    const result = await firstValueFrom(this.api.createTranscriptPrompt(episodeId, vocabulary));
    await navigator.clipboard.writeText(result.prompt);
  }
}
