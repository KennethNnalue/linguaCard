import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  LearningStage, PodcastEpisodeActivity, PodcastEpisodeCompletion, PodcastEpisodePlayer,
  PodcastEpisodePreparation, PodcastLibraryEpisode, PodcastLibraryResponse, PodcastLibraryTopic,
  PodcastPreparationVocabulary, PodcastThumbnail,
  PodcastTopicDetail,
} from '@lingua-card/shared/domain';
import { DataSource, In, Repository } from 'typeorm';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { calculatePodcastReadiness, podcastMasteryWeight } from '../domain/podcast-readiness';
import { PodcastEpisodeVocabularyEntity } from '../entities/podcast-episode-vocabulary.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastListeningProgressEntity } from '../entities/podcast-listening-progress.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { toPodcastThumbnail } from '../podcast-thumbnail.mapper';
import { PodcastLearningLoopService } from './podcast-learning-loop.service';

interface MasteryRow {
  lexemeId: string;
  learningItemId: string | null;
  mastery: string | null;
}

@Injectable()
export class PodcastCatalogueService {
  constructor(
    @InjectRepository(PodcastTopicEntity) private readonly topicRepo: Repository<PodcastTopicEntity>,
    @InjectRepository(PodcastEpisodeEntity) private readonly episodeRepo: Repository<PodcastEpisodeEntity>,
    @InjectRepository(PodcastThumbnailAssetEntity) private readonly thumbnailRepo: Repository<PodcastThumbnailAssetEntity>,
    @InjectRepository(PodcastEpisodeVocabularyEntity) private readonly vocabularyRepo: Repository<PodcastEpisodeVocabularyEntity>,
    private readonly dataSource: DataSource,
    private readonly learningLoop: PodcastLearningLoopService,
  ) {}

  async listTopics(userId: string): Promise<PodcastLibraryResponse> {
    const topics = await this.topicRepo.find({ where: { status: 'published' }, order: { publishedAt: 'DESC' } });
    if (!topics.length) return { topics: [], continueListening: null, recentEpisodes: [] };
    const episodes = await this.episodeRepo.find({
      where: { topicId: In(topics.map(topic => topic.id)), status: 'published' },
      order: { topicId: 'ASC', position: 'ASC' },
    });
    const thumbnails = await this.loadThumbnails([
      ...topics.map(topic => topic.thumbnailAssetId),
      ...episodes.map(episode => episode.thumbnailAssetId),
    ]);
    const libraryTopics = topics.map(topic => {
      const topicEpisodes = episodes.filter(episode => episode.topicId === topic.id);
      return this.toLibraryTopic(topic, topicEpisodes, thumbnails);
    });
    const vocabularyCounts = await this.vocabularyCounts(episodes.map(episode => episode.id));
    const activities = await this.loadActivities(userId, topics, episodes, thumbnails, vocabularyCounts);
    return {
      topics: libraryTopics,
      continueListening: activities.find(activity => activity.status === 'in_progress') ?? null,
      recentEpisodes: activities.slice(0, 6),
    };
  }

  async getCompletion(userId: string, episodeId: string): Promise<PodcastEpisodeCompletion> {
    const preparation = await this.getPreparation(userId, episodeId);
    const progress = await this.dataSource.getRepository(PodcastListeningProgressEntity)
      .findOneBy({ userId, episodeId });
    if (!progress?.completedAt) throw new ConflictException('Finish the episode before opening its recap');
    const episode = await this.episodeRepo.findOneBy({ id: episodeId, status: 'published' });
    if (!episode || progress.audioVersion !== episode.audioVersion) {
      throw new ConflictException('This episode has changed; listen to the current version first');
    }
    const nextEpisode = await this.episodeRepo.createQueryBuilder('episode')
      .where('episode.topicId = :topicId', { topicId: episode.topicId })
      .andWhere('episode.status = :status', { status: 'published' })
      .andWhere('episode.position > :position', { position: episode.position })
      .orderBy('episode.position', 'ASC').getOne();
    let next: PodcastLibraryEpisode | null = null;
    if (nextEpisode) {
      const thumbnail = await this.thumbnailRepo.findOneBy({ id: nextEpisode.thumbnailAssetId ?? '' });
      if (!thumbnail) throw new NotFoundException(`Podcast episode ${nextEpisode.id} thumbnail not found`);
      const counts = await this.vocabularyCounts([nextEpisode.id]);
      next = this.toLibraryEpisode(nextEpisode, toPodcastThumbnail(thumbnail), counts.get(nextEpisode.id) ?? 0);
    }
    return {
      episode: {
        id: preparation.episode.id, title: preparation.episode.title,
        titleTranslation: preparation.episode.titleTranslation, level: preparation.episode.level,
        position: preparation.episode.position, durationMs: preparation.episode.durationMs,
        focusVocabularyCount: preparation.episode.focusVocabularyCount,
        thumbnail: preparation.episode.thumbnail, topicId: preparation.episode.topicId,
        topicTitle: preparation.episode.topicTitle,
      },
      completedAt: progress.completedAt.toISOString(), vocabulary: preparation.vocabulary,
      nextEpisode: next,
    };
  }

  async getTopic(topicId: string): Promise<PodcastTopicDetail> {
    const topic = await this.topicRepo.findOneBy({ id: topicId, status: 'published' });
    if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
    const episodes = await this.episodeRepo.find({
      where: { topicId, status: 'published' }, order: { position: 'ASC' },
    });
    const thumbnails = await this.loadThumbnails([
      topic.thumbnailAssetId, ...episodes.map(episode => episode.thumbnailAssetId),
    ]);
    const vocabularyCounts = await this.vocabularyCounts(episodes.map(episode => episode.id));
    return {
      ...this.toLibraryTopic(topic, episodes, thumbnails),
      episodes: episodes.map(episode => this.toLibraryEpisode(
        episode, this.requireThumbnail(thumbnails, episode.thumbnailAssetId),
        vocabularyCounts.get(episode.id) ?? 0,
      )),
    };
  }

  async getPreparation(userId: string, episodeId: string): Promise<PodcastEpisodePreparation> {
    const episode = await this.episodeRepo.findOneBy({ id: episodeId, status: 'published' });
    if (!episode || !episode.audioUrl) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const topic = await this.topicRepo.findOneBy({ id: episode.topicId, status: 'published' });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
    const vocabularyLinks = await this.vocabularyRepo.find({ where: { episodeId }, order: { position: 'ASC' } });
    const lexemeIds = vocabularyLinks.map(link => link.lexemeId);
    const [lexemes, localizations, masteryRows, thumbnailEntity] = await Promise.all([
      lexemeIds.length ? this.dataSource.getRepository(LexemeEntity).findBy({ id: In(lexemeIds) }) : [],
      lexemeIds.length ? this.dataSource.getRepository(LexemeLocalizationEntity).find({
        where: { lexemeId: In(lexemeIds), language: topic.translationLanguage, isActive: true },
      }) : [],
      this.loadMastery(userId, topic, lexemeIds),
      this.thumbnailRepo.findOneBy({ id: episode.thumbnailAssetId ?? '' }),
    ]);
    if (!thumbnailEntity) throw new NotFoundException(`Podcast episode ${episodeId} thumbnail not found`);
    const lexemeById = new Map(lexemes.map(lexeme => [lexeme.id, lexeme]));
    const localizationByLexeme = new Map(localizations.map(item => [item.lexemeId, item]));
    const masteryByLexeme = new Map(masteryRows.map(row => [row.lexemeId, row]));
    const vocabulary: PodcastPreparationVocabulary[] = vocabularyLinks.map(link => {
      const lexeme = lexemeById.get(link.lexemeId);
      const localization = localizationByLexeme.get(link.lexemeId);
      if (!lexeme || !localization) throw new NotFoundException(`Podcast vocabulary ${link.lexemeId} is incomplete`);
      const masteryRow = masteryByLexeme.get(link.lexemeId);
      const mastery = this.toMastery(masteryRow?.mastery);
      return {
        lexemeId: link.lexemeId, text: lexeme.displayText, translation: localization.translation,
        importance: link.importance, mastery, masteryWeight: podcastMasteryWeight(mastery),
        isInVault: masteryRow?.learningItemId !== null && masteryRow?.learningItemId !== undefined,
      };
    });
    return {
      episode: {
        ...this.toLibraryEpisode(episode, toPodcastThumbnail(thumbnailEntity), vocabulary.length),
        topicId: topic.id, topicTitle: topic.title, description: episode.description,
        audioUrl: episode.audioUrl,
      },
      readiness: calculatePodcastReadiness(vocabulary),
      vocabulary,
    };
  }

  async getPlayer(userId: string, episodeId: string): Promise<PodcastEpisodePlayer> {
    const episode = await this.episodeRepo.findOneBy({ id: episodeId, status: 'published' });
    if (!episode?.audioUrl) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const [topic, thumbnail, speakers, turns, progress, playbackContext] = await Promise.all([
      this.topicRepo.findOneBy({ id: episode.topicId, status: 'published' }),
      this.thumbnailRepo.findOneBy({ id: episode.thumbnailAssetId ?? '' }),
      this.dataSource.getRepository(PodcastSpeakerEntity).find({
        where: { episodeId }, order: { position: 'ASC' },
      }),
      this.dataSource.getRepository(PodcastTurnEntity).find({
        where: { episodeId }, order: { position: 'ASC' },
      }),
      this.learningLoop.getProgress(userId, episodeId),
      this.loadPlaybackContext(episode),
    ]);
    if (!topic || !thumbnail) throw new NotFoundException(`Podcast episode ${episodeId} is incomplete`);
    return {
      id: episode.id, topicId: topic.id, topicTitle: topic.title, title: episode.title,
      audioUrl: episode.audioUrl, audioDurationMs: episode.audioDurationMs,
      audioVersion: episode.audioVersion, thumbnail: toPodcastThumbnail(thumbnail),
      speakers: speakers.map(speaker => ({
        id: speaker.id, key: speaker.speakerKey, name: speaker.displayName,
      })),
      turns: turns.map(turn => ({
        id: turn.id, speakerId: turn.speakerId, position: turn.position,
        targetText: turn.targetText, translation: turn.translation,
        startMs: turn.startMs ?? 0, endMs: turn.endMs ?? episode.audioDurationMs,
        wordTimings: turn.wordTimings,
      })),
      progress: progress?.audioVersion === episode.audioVersion ? progress : null,
      playbackContext,
    };
  }

  private async loadPlaybackContext(
    currentEpisode: PodcastEpisodeEntity,
  ): Promise<PodcastEpisodePlayer['playbackContext']> {
    const topicEpisodes = await this.episodeRepo.find({
      where: { topicId: currentEpisode.topicId, status: 'published' },
      order: { position: 'ASC' },
    });
    const currentIndex = topicEpisodes.findIndex(episode => episode.id === currentEpisode.id);
    const publishedTopics = await this.topicRepo.find({
      where: { status: 'published' }, order: { publishedAt: 'DESC' },
    });
    const topicIndex = publishedTopics.findIndex(topic => topic.id === currentEpisode.topicId);
    const followingTopic = topicIndex >= 0 ? publishedTopics[topicIndex + 1] : undefined;
    const followingTopicFirstEpisode = followingTopic
      ? await this.episodeRepo.findOne({
        where: { topicId: followingTopic.id, status: 'published' }, order: { position: 'ASC' },
      })
      : null;
    return {
      firstEpisodeId: topicEpisodes[0]?.id ?? currentEpisode.id,
      previousEpisodeId: currentIndex > 0 ? topicEpisodes[currentIndex - 1].id : null,
      nextEpisodeId: currentIndex >= 0 ? topicEpisodes[currentIndex + 1]?.id ?? null : null,
      nextTopic: followingTopic && followingTopicFirstEpisode ? {
        id: followingTopic.id,
        title: followingTopic.title,
        firstEpisodeId: followingTopicFirstEpisode.id,
      } : null,
    };
  }

  private async loadMastery(
    userId: string,
    topic: PodcastTopicEntity,
    lexemeIds: string[],
  ): Promise<MasteryRow[]> {
    if (!lexemeIds.length) return [];
    return this.dataSource.query<MasteryRow[]>(`
      SELECT lexeme.id AS "lexemeId", item.id AS "learningItemId", scheduling.state->>'stage' AS mastery
      FROM lexemes lexeme
      LEFT JOIN learning_contexts context
        ON context."userId" = $1 AND context."sourceLanguage" = $2
       AND context."targetLanguage" = $3 AND context."isActive" = true
      LEFT JOIN learning_items item
        ON item."learningContextId" = context.id AND item."userId" = $1 AND item."lexemeId" = lexeme.id
      LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
      WHERE lexeme.id = ANY($4::varchar[])
    `, [userId, topic.translationLanguage, topic.targetLanguage, lexemeIds]);
  }

  private async vocabularyCounts(episodeIds: string[]): Promise<Map<string, number>> {
    if (!episodeIds.length) return new Map();
    const links = await this.vocabularyRepo.findBy({ episodeId: In(episodeIds) });
    const counts = new Map<string, number>();
    for (const link of links) counts.set(link.episodeId, (counts.get(link.episodeId) ?? 0) + 1);
    return counts;
  }

  private async loadActivities(
    userId: string,
    topics: PodcastTopicEntity[],
    episodes: PodcastEpisodeEntity[],
    thumbnails: ReadonlyMap<string, PodcastThumbnail>,
    vocabularyCounts: ReadonlyMap<string, number>,
  ): Promise<PodcastEpisodeActivity[]> {
    if (!episodes.length) return [];
    const progressRows = await this.dataSource.getRepository(PodcastListeningProgressEntity).find({
      where: { userId, episodeId: In(episodes.map(episode => episode.id)) },
      order: { updatedAt: 'DESC' },
    });
    const episodeById = new Map(episodes.map(episode => [episode.id, episode]));
    const topicById = new Map(topics.map(topic => [topic.id, topic]));
    const activities: PodcastEpisodeActivity[] = [];
    for (const progress of progressRows) {
      const episode = episodeById.get(progress.episodeId);
      if (!episode || progress.audioVersion !== episode.audioVersion || progress.positionMs <= 0) continue;
      const topic = topicById.get(episode.topicId);
      if (!topic) continue;
      activities.push({
        episode: {
          ...this.toLibraryEpisode(
            episode, this.requireThumbnail(thumbnails, episode.thumbnailAssetId),
            vocabularyCounts.get(episode.id) ?? 0,
          ),
          topicId: topic.id, topicTitle: topic.title,
        },
        positionMs: progress.positionMs,
        progressPercent: episode.audioDurationMs
          ? Math.min(100, Math.round(progress.positionMs / episode.audioDurationMs * 100)) : 0,
        status: progress.completedAt ? 'completed' : 'in_progress',
        completedAt: progress.completedAt?.toISOString() ?? null,
        updatedAt: progress.updatedAt.toISOString(),
      });
    }
    return activities;
  }

  private async loadThumbnails(ids: Array<string | null>): Promise<Map<string, PodcastThumbnail>> {
    const presentIds = [...new Set(ids.filter((id): id is string => id !== null))];
    if (!presentIds.length) return new Map();
    const entities = await this.thumbnailRepo.findBy({ id: In(presentIds) });
    return new Map(entities.map(entity => [entity.id, toPodcastThumbnail(entity)]));
  }

  private toLibraryTopic(
    topic: PodcastTopicEntity,
    episodes: PodcastEpisodeEntity[],
    thumbnails: ReadonlyMap<string, PodcastThumbnail>,
  ): PodcastLibraryTopic {
    return {
      id: topic.id, title: topic.title, description: topic.description,
      targetLanguage: topic.targetLanguage, translationLanguage: topic.translationLanguage,
      minimumLevel: topic.minimumLevel, maximumLevel: topic.maximumLevel,
      episodeCount: episodes.length,
      totalDurationMs: episodes.reduce((total, episode) => total + episode.audioDurationMs, 0),
      thumbnail: this.requireThumbnail(thumbnails, topic.thumbnailAssetId),
    };
  }

  private toLibraryEpisode(
    episode: PodcastEpisodeEntity,
    thumbnail: PodcastThumbnail,
    focusVocabularyCount: number,
  ): PodcastLibraryEpisode {
    return {
      id: episode.id, title: episode.title, titleTranslation: episode.titleTranslation,
      level: episode.level, position: episode.position, durationMs: episode.audioDurationMs,
      focusVocabularyCount, thumbnail,
    };
  }

  private requireThumbnail(
    thumbnails: ReadonlyMap<string, PodcastThumbnail>,
    assetId: string | null,
  ): PodcastThumbnail {
    const thumbnail = assetId ? thumbnails.get(assetId) : undefined;
    if (!thumbnail) throw new NotFoundException('Published podcast thumbnail is missing');
    return thumbnail;
  }

  private toMastery(value: string | null | undefined): LearningStage {
    return value === 'learning' || value === 'familiar' || value === 'strong' || value === 'mastered'
      ? value
      : 'new';
  }
}
