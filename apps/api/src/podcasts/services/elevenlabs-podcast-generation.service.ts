import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminCreateElevenLabsPodcastResult } from '@lingua-card/shared/domain';
import { DataSource } from 'typeorm';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { ElevenLabsDialogueAdapter } from '../infrastructure/elevenlabs-dialogue.adapter';
import { ElevenLabsPodcastAdapter } from '../infrastructure/elevenlabs-podcast.adapter';
import { normalizePodcastVocabulary } from '../domain/podcast-transcript-prompt';

@Injectable()
export class ElevenLabsPodcastGenerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly voices: ElevenLabsDialogueAdapter,
    private readonly podcasts: ElevenLabsPodcastAdapter,
  ) {}

  async create(episodeId: string, vocabulary: readonly string[]): Promise<AdminCreateElevenLabsPodcastResult> {
    const episodeRepository = this.dataSource.getRepository(PodcastEpisodeEntity);
    const episode = await episodeRepository.findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    if (episode.elevenLabsProjectId) {
      return { episodeId, projectId: episode.elevenLabsProjectId, status: 'processing' };
    }
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
    const [hostVoiceId, guestVoiceId] = await this.voices.resolveVoiceIds(['female', 'male']);
    const projectId = await this.podcasts.create({
      title: episode.title,
      language: topic.targetLanguage,
      sourceText: normalizePodcastVocabulary(vocabulary).join('\n'),
      hostVoiceId,
      guestVoiceId,
    });
    episode.elevenLabsProjectId = projectId;
    await episodeRepository.save(episode);
    return { episodeId, projectId, status: 'processing' };
  }
}
