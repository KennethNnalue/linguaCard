import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { AdminPodcastEpisodeListItem } from '@lingua-card/shared/domain';
import { AdminPodcastsService } from './admin-podcasts.service';
import { PodcastTranscriptGenerationService } from './podcast-transcript-generation.service';
import { PodcastTranscriptImportService } from './podcast-transcript-import.service';
import { normalizePodcastVocabulary } from '../domain/podcast-transcript-prompt';

@Injectable()
export class PodcastEpisodeCreationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PodcastEpisodeCreationService.name);

  constructor(
    private readonly podcasts: AdminPodcastsService,
    private readonly transcriptGeneration: PodcastTranscriptGenerationService,
    private readonly transcriptImport: PodcastTranscriptImportService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pendingEpisodes = await this.podcasts.findPendingGeneratedEpisodes();
    for (const episode of pendingEpisodes) this.schedule(episode.id);
  }

  async create(
    topicId: string,
    input: { requestId: string; vocabulary: readonly string[]; direction?: string },
  ): Promise<AdminPodcastEpisodeListItem> {
    const generationInput = {
      vocabulary: normalizePodcastVocabulary(input.vocabulary),
      ...(input.direction?.trim() ? { direction: input.direction.trim() } : {}),
    };
    const episode = await this.podcasts.reserveEpisode(topicId, input.requestId, generationInput);
    if (episode.status === 'queued') this.schedule(episode.id);
    return episode;
  }

  async retry(episodeId: string): Promise<AdminPodcastEpisodeListItem> {
    const episode = await this.podcasts.queueFailedEpisode(episodeId);
    this.schedule(episode.id);
    return episode;
  }

  private schedule(episodeId: string): void {
    queueMicrotask(() => {
      void this.process(episodeId).catch(error => {
        this.logger.error(
          `Podcast episode generation failed for ${episodeId}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    });
  }

  private async process(episodeId: string): Promise<void> {
    const claimed = await this.podcasts.markEpisodeGenerationStarted(episodeId);
    if (!claimed) return;
    try {
      const episode = await this.podcasts.findEpisodeEntity(episodeId);
      const input = episode.generationInput;
      if (!input) {
        await this.podcasts.markEpisodeGenerationFailed(episodeId, 'Generation input is missing');
        return;
      }
      const generated = await this.transcriptGeneration.generate(
        episodeId,
        input.vocabulary,
        input.direction,
      );
      if (generated.preview.status !== 'valid') {
        const message = generated.preview.conflicts.map(conflict => conflict.message).join(' ');
        await this.podcasts.markEpisodeGenerationFailed(episodeId, message || 'The transcript needs corrections');
        return;
      }
      await this.transcriptImport.commit(episodeId, {
        fingerprint: generated.preview.fingerprint,
        payload: generated.payload,
      });
    } catch (error) {
      await this.podcasts.markEpisodeGenerationFailed(
        episodeId,
        error instanceof Error ? error.message : 'Episode generation failed',
      );
    }
  }
}
