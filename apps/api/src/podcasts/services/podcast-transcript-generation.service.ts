import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type {
  AdminGeneratePodcastTranscriptResult,
  AdminPodcastTranscriptPayload,
} from '@lingua-card/shared/domain';
import { DataSource } from 'typeorm';
import { OpenRouterAdapter } from '../../ai/providers/openrouter.adapter';
import { PodcastTranscriptPayloadDto } from '../dto/admin-podcast.dto';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTranscriptImportService } from './podcast-transcript-import.service';
import { buildPodcastTranscriptPrompt } from '../domain/podcast-transcript-prompt';

@Injectable()
export class PodcastTranscriptGenerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ai: OpenRouterAdapter,
    private readonly transcriptImport: PodcastTranscriptImportService,
  ) {}

  async generate(
    episodeId: string,
    vocabulary: readonly string[],
    direction?: string,
  ): Promise<AdminGeneratePodcastTranscriptResult> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);

    const response = await this.ai.generateText({
      messages: [{ role: 'user', content: this.buildPrompt(topic, vocabulary, direction) }],
      maxTokens: 6_000,
      temperature: 0.5,
    });
    const payload = await this.parsePayload(response.text);
    return {
      payload,
      preview: await this.transcriptImport.preview(episodeId, payload),
    };
  }

  async prompt(
    episodeId: string,
    vocabulary: readonly string[],
    direction?: string,
  ): Promise<string> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
    return this.buildPrompt(topic, vocabulary, direction);
  }

  private async parsePayload(response: string): Promise<AdminPodcastTranscriptPayload> {
    const json = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1] ?? response;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json.trim());
    } catch {
      throw new BadGatewayException('The AI provider returned invalid transcript JSON');
    }
    const payload = plainToInstance(PodcastTranscriptPayloadDto, parsed);
    const errors = await validate(payload, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadGatewayException('The AI provider returned an invalid transcript');
    return payload;
  }

  private buildPrompt(
    topic: PodcastTopicEntity,
    vocabulary: readonly string[],
    direction?: string,
  ): string {
    return buildPodcastTranscriptPrompt({
      topicTitle: topic.title,
      topicDescription: topic.description,
      targetLanguage: topic.targetLanguage,
      translationLanguage: topic.translationLanguage,
      level: topic.level,
      vocabulary,
      direction,
    });
  }

}
