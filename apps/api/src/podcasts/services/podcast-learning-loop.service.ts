import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ArticleType, GenderType, PodcastListeningProgress, PreparePodcastVocabularyResult,
} from '@lingua-card/shared/domain';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { CardEntity } from '../../cards/card.entity';
import { CollectionEntity } from '../../collections/collection.entity';
import { LearningContextEntity } from '../../learning-items/entities/learning-context.entity';
import { LearningItemEntity } from '../../learning-items/entities/learning-item.entity';
import { createNewReviewScheduling } from '../../review/review-scheduling.entity';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { SavePodcastProgressDto } from '../dto/admin-podcast.dto';
import { PodcastEpisodeVocabularyEntity } from '../entities/podcast-episode-vocabulary.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastListeningProgressEntity } from '../entities/podcast-listening-progress.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';

interface PodcastProgressUpdate {
  positionMs: number;
  completedAt: Date | null;
}

export function resolvePodcastProgressUpdate(
  currentCompletedAt: Date | null,
  episodeDurationMs: number,
  requestedPositionMs: number,
  requestedCompleted: boolean,
  completedAt: Date,
): PodcastProgressUpdate {
  if (currentCompletedAt) {
    return { positionMs: episodeDurationMs, completedAt: currentCompletedAt };
  }
  if (requestedCompleted) {
    return { positionMs: episodeDurationMs, completedAt };
  }
  return {
    positionMs: Math.min(requestedPositionMs, episodeDurationMs),
    completedAt: null,
  };
}

@Injectable()
export class PodcastLearningLoopService {
  constructor(private readonly dataSource: DataSource) {}

  async getProgress(userId: string, episodeId: string): Promise<PodcastListeningProgress | null> {
    const progress = await this.dataSource.getRepository(PodcastListeningProgressEntity)
      .findOneBy({ userId, episodeId });
    return progress ? this.toProgress(progress) : null;
  }

  async saveProgress(
    userId: string, episodeId: string, dto: SavePodcastProgressDto,
  ): Promise<PodcastListeningProgress> {
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`podcast-progress:${userId}:${episodeId}`]);
      const episode = await manager.findOneBy(PodcastEpisodeEntity, { id: episodeId, status: 'published' });
      if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
      if (episode.audioVersion !== dto.audioVersion) throw new ConflictException('Podcast audio changed; reload the episode');
      let progress = await manager.findOneBy(PodcastListeningProgressEntity, { userId, episodeId });
      if (!progress) progress = manager.create(PodcastListeningProgressEntity, {
        id: randomUUID(), userId, episodeId, audioVersion: dto.audioVersion,
        positionMs: 0, completedAt: null,
      });
      const update = resolvePodcastProgressUpdate(
        progress.completedAt,
        episode.audioDurationMs,
        dto.positionMs,
        dto.completed,
        new Date(),
      );
      progress.audioVersion = dto.audioVersion;
      progress.positionMs = update.positionMs;
      progress.completedAt = update.completedAt;
      return this.toProgress(await manager.save(progress));
    });
  }

  async prepareVocabulary(userId: string, episodeId: string): Promise<PreparePodcastVocabularyResult> {
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`podcast-vocabulary:${userId}:${episodeId}`]);
      const episode = await manager.findOneBy(PodcastEpisodeEntity, { id: episodeId, status: 'published' });
      if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
      const topic = await manager.findOneBy(PodcastTopicEntity, { id: episode.topicId, status: 'published' });
      if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
      const existingCollection = await manager.findOneBy(CollectionEntity, { userId, sourcePodcastEpisodeId: episodeId });
      if (existingCollection) {
        const counts: Array<{ count: number }> = await manager.query(
          'SELECT COUNT(*)::int AS count FROM user_collection_items WHERE "collectionId"=$1',
          [existingCollection.id],
        );
        const count = counts[0]?.count ?? 0;
        return { collectionId: existingCollection.id, addedCount: 0, reusedCount: count };
      }
      const context = await this.learningContext(manager, userId, topic);
      const collection = manager.create(CollectionEntity, {
        id: randomUUID(), userId, name: `Podcast · ${episode.title}`,
        description: `Essential vocabulary for ${episode.title}`, emoji: '🎙️', colour: '#2D5A4E',
        contextId: `${topic.targetLanguage}-vocab`, learningContextId: context.id, coverSeed: episode.externalId,
        coverImageUrl: null, cardCount: 0, masteredCount: 0, dueCount: 0, isDefault: false,
        importStatus: 'complete', pendingWords: [], sourcePlatformCollectionId: null,
        sourcePodcastEpisodeId: episodeId, level: episode.level, topic: topic.title,
      });
      await manager.save(collection);
      const links = await manager.find(PodcastEpisodeVocabularyEntity, {
        where: { episodeId, importance: 'essential' }, order: { position: 'ASC' },
      });
      let addedCount = 0;
      let reusedCount = 0;
      for (const link of links) {
        const existingItems: Array<{ id: string; mastery: string | null }> = await manager.query(`
          SELECT item.id, scheduling.state->>'stage' AS mastery FROM learning_items item
          LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
          WHERE item."userId"=$1 AND item."learningContextId"=$2 AND item."lexemeId"=$3 LIMIT 1
        `, [userId, context.id, link.lexemeId]);
        const existing = existingItems[0];
        if (existing && (existing.mastery === 'familiar' || existing.mastery === 'strong' || existing.mastery === 'mastered')) continue;
        let learningItemId = existing?.id;
        if (!learningItemId) {
          const [lexeme, localization] = await Promise.all([
            manager.findOneBy(LexemeEntity, { id: link.lexemeId }),
            manager.findOneBy(LexemeLocalizationEntity, {
              lexemeId: link.lexemeId, language: topic.translationLanguage, isActive: true,
            }),
          ]);
          if (!lexeme || !localization) throw new ConflictException(`Podcast vocabulary ${link.lexemeId} is incomplete`);
          const cardId = randomUUID();
          await manager.save(manager.create(CardEntity, {
            id: cardId, userId, collectionId: collection.id, deckId: 'deck-001',
            contextId: `${topic.targetLanguage}-vocab`,
            dictionaryWordId: null,
            content: {
              front: localization.translation, back: lexeme.displayText,
              article: this.article(lexeme), gender: this.gender(lexeme), plural: null,
              examples: [], synonyms: [], notes: '', imageUrl: null, phonetic: lexeme.phonetic,
            },
            categoryIds: [], tags: [`podcast:${episodeId}`], version: 1,
            scheduling: createNewReviewScheduling(cardId),
          }));
          const learningItem = await manager.save(manager.create(LearningItemEntity, {
            id: cardId, userId, learningContextId: context.id, lexemeId: link.lexemeId,
            legacyCardId: cardId, personalNote: '', customImageUrl: null,
          }));
          learningItemId = learningItem.id;
          addedCount += 1;
        } else reusedCount += 1;
        await manager.query(`INSERT INTO user_collection_items ("collectionId","learningItemId",position)
          VALUES ($1,$2,$3) ON CONFLICT ("collectionId","learningItemId") DO NOTHING`,
        [collection.id, learningItemId, link.position]);
      }
      if (addedCount + reusedCount === 0) {
        throw new ConflictException('No essential vocabulary currently needs preparation');
      }
      collection.cardCount = addedCount + reusedCount;
      await manager.save(collection);
      return { collectionId: collection.id, addedCount, reusedCount };
    });
  }

  private async learningContext(
    manager: EntityManager, userId: string, topic: PodcastTopicEntity,
  ): Promise<LearningContextEntity> {
    let context = await manager.findOneBy(LearningContextEntity, {
      userId, sourceLanguage: topic.translationLanguage, targetLanguage: topic.targetLanguage,
    });
    if (!context) context = await manager.save(manager.create(LearningContextEntity, {
      id: randomUUID(), userId, sourceLanguage: topic.translationLanguage,
      targetLanguage: topic.targetLanguage, isActive: true,
    }));
    return context;
  }

  private article(lexeme: LexemeEntity): ArticleType | null {
    const value = lexeme.grammar.article;
    return value === 'der' || value === 'die' || value === 'das' || value === 'le'
      || value === 'la' || value === 'el' || value === 'un' || value === 'une'
      ? value : null;
  }

  private gender(lexeme: LexemeEntity): GenderType {
    const value = lexeme.grammar.gender;
    return value === 'masculine' || value === 'feminine' || value === 'neuter' ? value : null;
  }

  private toProgress(entity: PodcastListeningProgressEntity): PodcastListeningProgress {
    return {
      episodeId: entity.episodeId, audioVersion: entity.audioVersion, positionMs: entity.positionMs,
      completedAt: entity.completedAt?.toISOString() ?? null, updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
