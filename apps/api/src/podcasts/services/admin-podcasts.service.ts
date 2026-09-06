import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import type {
  AdminPodcastEpisodeListItem,
  AdminPodcastTranscriptDetails,
  AdminPodcastTopicListItem,
  PodcastThumbnail,
} from '@lingua-card/shared/domain';
import { CreatePodcastTopicDto, UpdatePodcastEpisodeDto, UpdatePodcastTopicDto } from '../dto/admin-podcast.dto';
import { PodcastEpisodeEntity, PodcastEpisodeGenerationInput } from '../entities/podcast-episode.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { toPodcastThumbnail } from '../podcast-thumbnail.mapper';
import { PodcastThumbnailService } from './podcast-thumbnail.service';
import { podcastEpisodeExternalId, podcastExternalId } from '../domain/podcast-external-id';
import { StorageService } from '../../storage/storage.service';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AdminPodcastsService {
  constructor(
    @InjectRepository(PodcastTopicEntity)
    private readonly topicRepo: Repository<PodcastTopicEntity>,
    @InjectRepository(PodcastEpisodeEntity)
    private readonly episodeRepo: Repository<PodcastEpisodeEntity>,
    @InjectRepository(PodcastThumbnailAssetEntity)
    private readonly thumbnailRepo: Repository<PodcastThumbnailAssetEntity>,
    private readonly dataSource: DataSource,
    private readonly thumbnails: PodcastThumbnailService,
    private readonly storage: StorageService,
  ) {}

  async listTopics(): Promise<AdminPodcastTopicListItem[]> {
    const [topics, episodes] = await Promise.all([
      this.topicRepo.find({ order: { updatedAt: 'DESC' } }),
      this.episodeRepo.find({ order: { topicId: 'ASC', position: 'ASC' } }),
    ]);
    const thumbnailIds = [
      ...topics.map(topic => topic.thumbnailAssetId),
      ...episodes.map(episode => episode.thumbnailAssetId),
    ].filter((id): id is string => id !== null);
    const thumbnailEntities = thumbnailIds.length
      ? await this.thumbnailRepo.findBy({ id: In([...new Set(thumbnailIds)]) })
      : [];
    const thumbnailById = new Map(
      thumbnailEntities.map(entity => [entity.id, toPodcastThumbnail(entity)]),
    );
    const episodesByTopic = new Map<string, PodcastEpisodeEntity[]>();
    for (const episode of episodes) {
      const topicEpisodes = episodesByTopic.get(episode.topicId) ?? [];
      topicEpisodes.push(episode);
      episodesByTopic.set(episode.topicId, topicEpisodes);
    }
    return topics.map(topic => this.toTopicModel(
      topic,
      episodesByTopic.get(topic.id) ?? [],
      thumbnailById,
    ));
  }

  async createTopic(dto: CreatePodcastTopicDto): Promise<AdminPodcastTopicListItem> {
    if (dto.targetLanguage === dto.translationLanguage) {
      throw new BadRequestException('Target and translation languages must be different');
    }
    const externalId = podcastExternalId(dto.title);
    const entity = this.topicRepo.create({
      id: randomUUID(),
      externalId,
      title: dto.title.trim(),
      description: dto.description.trim(),
      targetLanguage: dto.targetLanguage,
      translationLanguage: dto.translationLanguage,
      level: dto.level,
      status: 'draft',
      thumbnailAssetId: null,
      publishedAt: null,
    });
    try {
      const saved = await this.topicRepo.save(entity);
      return this.toTopicModel(saved, [], new Map());
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`A podcast topic derived as “${externalId}” already exists`);
      }
      throw error;
    }
  }

  async updateTopic(
    topicId: string,
    dto: UpdatePodcastTopicDto,
  ): Promise<AdminPodcastTopicListItem> {
    await this.dataSource.transaction(async manager => {
      const topic = await manager.findOne(PodcastTopicEntity, {
        where: { id: topicId }, lock: { mode: 'pessimistic_write' },
      });
      if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
      const level = dto.level ?? topic.level;
      const episodes = await manager.findBy(PodcastEpisodeEntity, { topicId });
      const incompatibleEpisode = episodes.find(
        episode => episode.level !== level,
      );
      if (incompatibleEpisode) {
        throw new ConflictException(
          `Episode “${incompatibleEpisode.title}” uses a different learner level`,
        );
      }
      if (dto.title !== undefined) topic.title = dto.title.trim();
      if (dto.description !== undefined) topic.description = dto.description.trim();
      topic.level = level;
      await manager.save(topic);
    });
    return this.findTopicModel(topicId);
  }

  async reserveEpisode(
    topicId: string,
    requestId: string,
    generationInput: PodcastEpisodeGenerationInput | null,
  ): Promise<AdminPodcastEpisodeListItem> {
    const existing = await this.episodeRepo.findOneBy({ generationRequestId: requestId });
    if (existing) {
      if (existing.topicId !== topicId) throw new ConflictException('This request identifier is already in use');
      return this.findEpisodeModel(existing.id);
    }
    let episodeId: string;
    try {
      episodeId = await this.dataSource.transaction(async manager => {
        const topic = await manager.findOne(PodcastTopicEntity, {
          where: { id: topicId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
        const existingRequest = await manager.findOneBy(PodcastEpisodeEntity, { generationRequestId: requestId });
        if (existingRequest) {
          if (existingRequest.topicId !== topicId) throw new ConflictException('This request identifier is already in use');
          return existingRequest.id;
        }
        const maximumPosition = await manager.maximum(PodcastEpisodeEntity, 'position', { topicId });
        const position = (maximumPosition ?? -1) + 1;
        const entity = manager.create(PodcastEpisodeEntity, {
          id: randomUUID(),
          topicId,
          externalId: podcastEpisodeExternalId(topic.externalId, `episode-${position + 1}`, position),
          title: `Episode ${position + 1}`,
          titleTranslation: '',
          description: '',
          level: topic.level,
          position,
          status: generationInput ? 'queued' : 'draft',
          thumbnailAssetId: null,
          audioUrl: null,
          audioStoragePath: null,
          audioDurationMs: 0,
          contentVersion: 1,
          audioVersion: 0,
          transcriptFingerprint: null,
          estimatedDurationMs: 0,
          generationError: null,
          generationRequestId: requestId,
          generationInput,
          elevenLabsProjectId: null,
          publishedAt: null,
        });
        return (await manager.save(entity)).id;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('An episode with this derived identifier already exists');
      }
      throw error;
    }
    return this.findEpisodeModel(episodeId);
  }

  async findPendingGeneratedEpisodes(): Promise<PodcastEpisodeEntity[]> {
    await this.episodeRepo.update({ status: 'generating' }, { status: 'queued' });
    return this.episodeRepo.find({ where: { status: 'queued' } });
  }

  async findEpisodeEntity(episodeId: string): Promise<PodcastEpisodeEntity> {
    const episode = await this.episodeRepo.findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    return episode;
  }

  async updateEpisode(
    episodeId: string,
    dto: UpdatePodcastEpisodeDto,
  ): Promise<AdminPodcastEpisodeListItem> {
    const episode = await this.findEpisodeEntity(episodeId);
    if (dto.title !== undefined) episode.title = dto.title.trim();
    if (dto.titleTranslation !== undefined) episode.titleTranslation = dto.titleTranslation.trim();
    if (dto.description !== undefined) episode.description = dto.description.trim();
    await this.episodeRepo.save(episode);
    return this.findEpisodeModel(episodeId);
  }

  async deleteEpisode(episodeId: string): Promise<void> {
    const episode = await this.findEpisodeEntity(episodeId);
    const thumbnail = episode.thumbnailAssetId
      ? await this.thumbnailRepo.findOneBy({ id: episode.thumbnailAssetId }) : null;
    await this.dataSource.transaction(async manager => {
      await manager.delete(PodcastEpisodeEntity, { id: episodeId });
      if (thumbnail) await manager.delete(PodcastThumbnailAssetEntity, { id: thumbnail.id });
    });
    if (thumbnail) await this.thumbnails.remove(this.thumbnailStoragePaths(thumbnail));
    if (episode.audioStoragePath) await this.storage.delete(episode.audioStoragePath);
  }

  async deleteTopic(topicId: string): Promise<void> {
    const topic = await this.topicRepo.findOneBy({ id: topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
    const episodes = await this.episodeRepo.findBy({ topicId });
    const thumbnailIds = [topic.thumbnailAssetId, ...episodes.map(episode => episode.thumbnailAssetId)]
      .filter((id): id is string => id !== null);
    const thumbnails = thumbnailIds.length
      ? await this.thumbnailRepo.findBy({ id: In([...new Set(thumbnailIds)]) }) : [];
    await this.dataSource.transaction(async manager => {
      await manager.delete(PodcastTopicEntity, { id: topicId });
      if (thumbnailIds.length) await manager.delete(PodcastThumbnailAssetEntity, thumbnailIds);
    });
    await Promise.all(thumbnails.map(thumbnail => this.thumbnails.remove(this.thumbnailStoragePaths(thumbnail))));
    await Promise.all(episodes.map(episode => episode.audioStoragePath
      ? this.storage.delete(episode.audioStoragePath) : Promise.resolve()));
  }

  async findEpisodeTranscript(episodeId: string): Promise<AdminPodcastTranscriptDetails> {
    const episode = await this.findEpisodeEntity(episodeId);
    if (!episode.transcriptFingerprint) {
      throw new NotFoundException(`Podcast episode ${episodeId} does not have a transcript`);
    }
    const [speakers, turns] = await Promise.all([
      this.dataSource.getRepository(PodcastSpeakerEntity).find({
        where: { episodeId }, order: { position: 'ASC' },
      }),
      this.dataSource.getRepository(PodcastTurnEntity).find({
        where: { episodeId }, order: { position: 'ASC' },
      }),
    ]);
    const speakerKeyById = new Map(speakers.map(speaker => [speaker.id, speaker.speakerKey]));
    return {
      episodeId,
      speakers: speakers.map(speaker => ({
        key: speaker.speakerKey,
        name: speaker.displayName,
        voiceGender: speaker.voiceGender,
        voiceId: speaker.voiceId,
      })),
      turns: turns.map(turn => ({
        speakerKey: speakerKeyById.get(turn.speakerId) ?? 'unknown',
        targetText: turn.targetText,
        translation: turn.translation,
        vocabularyRefs: turn.vocabularyKeys,
      })),
    };
  }

  async markEpisodeGenerationStarted(episodeId: string): Promise<boolean> {
    const result = await this.episodeRepo.update(
      { id: episodeId, status: 'queued' },
      { status: 'generating', generationError: null },
    );
    return (result.affected ?? 0) > 0;
  }

  async markEpisodeGenerationFailed(episodeId: string, message: string): Promise<void> {
    await this.episodeRepo.update(
      { id: episodeId },
      { status: 'failed', generationError: message.slice(0, 1000) },
    );
  }

  async queueFailedEpisode(episodeId: string): Promise<AdminPodcastEpisodeListItem> {
    const result = await this.episodeRepo.update(
      { id: episodeId, status: 'failed' },
      { status: 'queued', generationError: null },
    );
    if (!(result.affected ?? 0)) throw new ConflictException('Only a failed episode can be retried');
    return this.findEpisodeModel(episodeId);
  }

  async attachTopicThumbnail(
    topicId: string,
    file: { buffer: Buffer; mimetype: string },
    metadata: { accessibilityDescription: string; focalPointX: number; focalPointY: number },
  ): Promise<PodcastThumbnail> {
    const prepared = await this.thumbnails.prepare(
      file.buffer,
      file.mimetype,
      metadata.accessibilityDescription,
      { x: metadata.focalPointX, y: metadata.focalPointY },
    );
    try {
      const replacedThumbnail = await this.dataSource.transaction(async manager => {
        const topic = await manager.findOne(PodcastTopicEntity, {
          where: { id: topicId }, lock: { mode: 'pessimistic_write' },
        });
        if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
        const previousThumbnail = topic.thumbnailAssetId
          ? await manager.findOneBy(PodcastThumbnailAssetEntity, { id: topic.thumbnailAssetId })
          : null;
        await manager.save(PodcastThumbnailAssetEntity, prepared.entity);
        topic.thumbnailAssetId = prepared.entity.id;
        await manager.save(topic);
        if (previousThumbnail) await manager.remove(previousThumbnail);
        return previousThumbnail;
      });
      if (replacedThumbnail) await this.thumbnails.remove(this.thumbnailStoragePaths(replacedThumbnail));
      return toPodcastThumbnail(prepared.entity);
    } catch (error) {
      await this.thumbnails.remove(prepared.storagePaths);
      throw error;
    }
  }

  async attachEpisodeThumbnail(
    episodeId: string,
    file: { buffer: Buffer; mimetype: string },
    metadata: { accessibilityDescription: string; focalPointX: number; focalPointY: number },
  ): Promise<PodcastThumbnail> {
    const prepared = await this.thumbnails.prepare(
      file.buffer,
      file.mimetype,
      metadata.accessibilityDescription,
      { x: metadata.focalPointX, y: metadata.focalPointY },
    );
    try {
      const replacedThumbnail = await this.dataSource.transaction(async manager => {
        const episode = await manager.findOne(PodcastEpisodeEntity, {
          where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
        });
        if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
        const previousThumbnail = episode.thumbnailAssetId
          ? await manager.findOneBy(PodcastThumbnailAssetEntity, { id: episode.thumbnailAssetId })
          : null;
        await manager.save(PodcastThumbnailAssetEntity, prepared.entity);
        episode.thumbnailAssetId = prepared.entity.id;
        await manager.save(episode);
        if (previousThumbnail) await manager.remove(previousThumbnail);
        return previousThumbnail;
      });
      if (replacedThumbnail) await this.thumbnails.remove(this.thumbnailStoragePaths(replacedThumbnail));
      return toPodcastThumbnail(prepared.entity);
    } catch (error) {
      await this.thumbnails.remove(prepared.storagePaths);
      throw error;
    }
  }

  async publishEpisode(episodeId: string): Promise<AdminPodcastEpisodeListItem> {
    await this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
      if (!episode.thumbnailAssetId) throw new ConflictException('Upload an episode thumbnail before publishing');
      if (!episode.audioUrl || episode.status !== 'ready_for_review') {
        throw new ConflictException('Generate and review episode audio before publishing');
      }
      episode.status = 'published';
      episode.publishedAt = new Date();
      await manager.save(episode);
    });
    return this.findEpisodeModel(episodeId);
  }

  async publishTopic(topicId: string): Promise<AdminPodcastTopicListItem> {
    await this.dataSource.transaction(async manager => {
      const topic = await manager.findOne(PodcastTopicEntity, {
        where: { id: topicId }, lock: { mode: 'pessimistic_write' },
      });
      if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
      if (!topic.thumbnailAssetId) throw new ConflictException('Upload a topic thumbnail before publishing');
      const publishedEpisodes = await manager.countBy(PodcastEpisodeEntity, {
        topicId, status: 'published',
      });
      if (!publishedEpisodes) throw new ConflictException('Publish at least one episode before publishing the topic');
      topic.status = 'published';
      topic.publishedAt = new Date();
      await manager.save(topic);
    });
    return this.findTopicModel(topicId);
  }

  private async findTopicModel(topicId: string): Promise<AdminPodcastTopicListItem> {
    const topics = await this.listTopics();
    const topic = topics.find(item => item.id === topicId);
    if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
    return topic;
  }

  async findEpisodeModel(episodeId: string): Promise<AdminPodcastEpisodeListItem> {
    const episode = await this.episodeRepo.findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const thumbnail = episode.thumbnailAssetId
      ? await this.thumbnailRepo.findOneBy({ id: episode.thumbnailAssetId })
      : null;
    return this.toEpisodeModel(episode, thumbnail ? toPodcastThumbnail(thumbnail) : null);
  }

  private toTopicModel(
    topic: PodcastTopicEntity,
    episodes: PodcastEpisodeEntity[],
    thumbnailById: ReadonlyMap<string, PodcastThumbnail>,
  ): AdminPodcastTopicListItem {
    return {
      id: topic.id,
      externalId: topic.externalId,
      title: topic.title,
      description: topic.description,
      targetLanguage: topic.targetLanguage,
      translationLanguage: topic.translationLanguage,
      level: topic.level,
      status: topic.status,
      thumbnail: topic.thumbnailAssetId ? thumbnailById.get(topic.thumbnailAssetId) ?? null : null,
      episodes: episodes.map(episode => this.toEpisodeModel(
        episode,
        episode.thumbnailAssetId ? thumbnailById.get(episode.thumbnailAssetId) ?? null : null,
      )),
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
    };
  }

  private toEpisodeModel(
    episode: PodcastEpisodeEntity,
    thumbnail: PodcastThumbnail | null,
  ): AdminPodcastEpisodeListItem {
    return {
      id: episode.id,
      topicId: episode.topicId,
      externalId: episode.externalId,
      title: episode.title,
      titleTranslation: episode.titleTranslation,
      description: episode.description,
      level: episode.level,
      position: episode.position,
      audioDurationMs: episode.audioDurationMs,
      audioUrl: episode.audioUrl,
      audioVersion: episode.audioVersion,
      generationError: episode.generationError,
      generationRequestId: episode.generationRequestId,
      elevenLabsProjectId: episode.elevenLabsProjectId,
      hasTranscript: episode.transcriptFingerprint !== null,
      estimatedDurationMs: episode.estimatedDurationMs,
      status: episode.status,
      thumbnail,
      createdAt: episode.createdAt.toISOString(),
      updatedAt: episode.updatedAt.toISOString(),
    };
  }

  private thumbnailStoragePaths(thumbnail: PodcastThumbnailAssetEntity): readonly string[] {
    return [thumbnail.originalStoragePath, thumbnail.cardStoragePath, thumbnail.heroStoragePath];
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof QueryFailedError && hasErrorCode(error, PG_UNIQUE_VIOLATION);
  }
}

function hasErrorCode(value: unknown, expectedCode: string): boolean {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && value.code === expectedCode;
}
