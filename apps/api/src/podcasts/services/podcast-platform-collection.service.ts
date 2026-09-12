import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  AdminPlatformCollectionListItem,
  AdminPublishPodcastVocabularyResult,
} from '@lingua-card/shared/domain';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { PlatformCollectionEntity } from '../../admin/platform-collection.entity';
import { PlatformCollectionWordEntity } from '../../admin/platform-collection-word.entity';
import {
  CanonicalDictionaryProjectionService,
  type CanonicalDictionaryProjectionInput,
} from '../../word-dictionary/canonical-dictionary-projection.service';
import { ExampleLocalizationEntity } from '../../vocabulary/entities/example-localization.entity';
import { ExampleSentenceEntity } from '../../vocabulary/entities/example-sentence.entity';
import { LanguageEntity } from '../../vocabulary/entities/language.entity';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastEpisodeVocabularyEntity } from '../entities/podcast-episode-vocabulary.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';

interface PreparedVocabulary {
  lexemeId: string;
  dictionaryWordId: string;
  position: number;
}

interface PublicationCounters {
  dictionaryReused: number;
  dictionaryCreated: number;
  audioReused: number;
  audioGenerated: number;
}

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class PodcastPlatformCollectionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dictionaryProjection: CanonicalDictionaryProjectionService,
  ) {}

  async publish(episodeId: string): Promise<AdminPublishPodcastVocabularyResult> {
    const episode = await this.requirePublishedEpisode(episodeId);
    const topic = await this.requirePublishedTopic(episode.topicId);
    const existing = await this.dataSource.getRepository(PlatformCollectionEntity)
      .findOneBy({ sourcePodcastEpisodeId: episodeId });
    if (existing) return this.result(existing, false, existing.wordCount, this.emptyCounters());
    const externalId = this.externalId(episode.externalId);
    const externalIdOwner = await this.dataSource.getRepository(PlatformCollectionEntity)
      .findOneBy({ externalId });
    if (externalIdOwner) {
      throw new ConflictException(`Platform collection external ID ${externalId} is already in use`);
    }

    const links = await this.essentialLinks(episodeId);
    const prepared = await this.prepareVocabulary(links, topic);
    const snapshot = links.map(link => `${link.id}:${link.lexemeId}:${link.position}`).join('|');
    const counters = this.counters(prepared.results);

    let committed: { collection: PlatformCollectionEntity; created: boolean };
    try {
      committed = await this.dataSource.transaction(async manager => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [`podcast-platform-collection:${episodeId}`],
        );
        const winningCollection = await manager.findOneBy(PlatformCollectionEntity, {
          sourcePodcastEpisodeId: episodeId,
        });
        if (winningCollection) return { collection: winningCollection, created: false };

        const lockedEpisode = await manager.findOne(PodcastEpisodeEntity, {
          where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
        });
        if (!lockedEpisode || lockedEpisode.status !== 'published') {
          throw new ConflictException('Publish the podcast episode before its vocabulary collection');
        }
        const lockedTopic = await manager.findOneBy(PodcastTopicEntity, { id: lockedEpisode.topicId });
        if (!lockedTopic || lockedTopic.status !== 'published') {
          throw new ConflictException('Publish the podcast topic before its vocabulary collection');
        }
        const thumbnail = lockedEpisode.thumbnailAssetId
          ? await manager.findOneBy(PodcastThumbnailAssetEntity, { id: lockedEpisode.thumbnailAssetId })
          : null;
        const currentLinks = await manager.find(PodcastEpisodeVocabularyEntity, {
          where: { episodeId, importance: 'essential' }, order: { position: 'ASC' },
        });
        const currentSnapshot = currentLinks
          .map(link => `${link.id}:${link.lexemeId}:${link.position}`).join('|');
        if (currentSnapshot !== snapshot) {
          throw new ConflictException('Podcast essential vocabulary changed; retry publication');
        }

        const now = new Date();
        const collection = manager.create(PlatformCollectionEntity, {
          id: randomUUID(),
          title: `Podcast · ${lockedEpisode.title}`.slice(0, 120),
          titleTranslation: lockedEpisode.titleTranslation ? `Podcast · ${lockedEpisode.titleTranslation}`.slice(0, 120) : null,
          externalId,
          description: `Essential vocabulary for ${lockedEpisode.title}`,
          sourceLanguage: lockedTopic.translationLanguage,
          targetLanguage: lockedTopic.targetLanguage,
          coverSeed: lockedEpisode.externalId,
          coverImageUrl: thumbnail?.cardUrl ?? null,
          emoji: '🎙️',
          level: lockedEpisode.level,
          topic: lockedTopic.title.slice(0, 80),
          isPublished: true,
          status: 'published',
          wordCount: prepared.items.length,
          sourcePodcastEpisodeId: episodeId,
          storyCategory: null,
          publishedAt: now,
        });
        await manager.save(collection);
        await manager.save(prepared.items.map(item => manager.create(PlatformCollectionWordEntity, {
          id: randomUUID(),
          platformCollectionId: collection.id,
          dictionaryWordId: item.dictionaryWordId,
          lexemeId: item.lexemeId,
          position: item.position,
        })));
        return { collection, created: true };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const winningCollection = await this.dataSource.getRepository(PlatformCollectionEntity)
        .findOneBy({ sourcePodcastEpisodeId: episodeId });
      if (winningCollection) {
        return this.result(winningCollection, false, winningCollection.wordCount, this.emptyCounters());
      }
      throw new ConflictException('Podcast vocabulary conflicts with an existing platform collection');
    }

    return this.result(
      committed.collection,
      committed.created,
      links.length,
      committed.created ? counters : this.emptyCounters(),
    );
  }

  private async requirePublishedEpisode(episodeId: string): Promise<PodcastEpisodeEntity> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    if (episode.status !== 'published') {
      throw new ConflictException('Publish the podcast episode before its vocabulary collection');
    }
    return episode;
  }

  private async requirePublishedTopic(topicId: string): Promise<PodcastTopicEntity> {
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${topicId} not found`);
    if (topic.status !== 'published') {
      throw new ConflictException('Publish the podcast topic before its vocabulary collection');
    }
    return topic;
  }

  private async essentialLinks(episodeId: string): Promise<PodcastEpisodeVocabularyEntity[]> {
    const links = await this.dataSource.getRepository(PodcastEpisodeVocabularyEntity).find({
      where: { episodeId, importance: 'essential' }, order: { position: 'ASC' },
    });
    if (!links.length) throw new ConflictException('The podcast episode has no essential vocabulary');
    if (new Set(links.map(link => link.lexemeId)).size !== links.length) {
      throw new ConflictException('The podcast episode contains duplicate essential vocabulary');
    }
    return links;
  }

  private async prepareVocabulary(
    links: readonly PodcastEpisodeVocabularyEntity[],
    topic: PodcastTopicEntity,
  ): Promise<{
    items: PreparedVocabulary[];
    results: Array<{ reused: boolean; audio: 'reused' | 'generated' }>;
  }> {
    const lexemeIds = links.map(link => link.lexemeId);
    const [lexemes, localizations, language, examples] = await Promise.all([
      this.dataSource.getRepository(LexemeEntity).findBy({ id: In(lexemeIds) }),
      this.dataSource.getRepository(LexemeLocalizationEntity).findBy({
        lexemeId: In(lexemeIds), language: topic.translationLanguage, isActive: true,
      }),
      this.dataSource.getRepository(LanguageEntity).findOneBy({ code: topic.targetLanguage }),
      this.dataSource.getRepository(ExampleSentenceEntity).find({
        where: { lexemeId: In(lexemeIds), language: topic.targetLanguage },
        order: { position: 'ASC' },
      }),
    ]);
    if (!language) throw new ConflictException(`Target language ${topic.targetLanguage} is not configured`);
    const localizationCountByLexeme = new Map<string, number>();
    for (const localization of localizations) {
      localizationCountByLexeme.set(
        localization.lexemeId,
        (localizationCountByLexeme.get(localization.lexemeId) ?? 0) + 1,
      );
    }
    const ambiguousLocalization = links.find(
      link => (localizationCountByLexeme.get(link.lexemeId) ?? 0) > 1,
    );
    if (ambiguousLocalization) {
      throw new ConflictException(
        `Podcast vocabulary ${ambiguousLocalization.lexemeId} has multiple active localizations`,
      );
    }
    const exampleLocalizations = examples.length
      ? await this.dataSource.getRepository(ExampleLocalizationEntity).findBy({
        exampleSentenceId: In(examples.map(example => example.id)),
        language: topic.translationLanguage,
        isActive: true,
      })
      : [];
    const lexemeById = new Map(lexemes.map(lexeme => [lexeme.id, lexeme]));
    const localizationByLexeme = new Map(localizations.map(item => [item.lexemeId, item]));
    const exampleLocalizationById = new Map(
      exampleLocalizations.map(item => [item.exampleSentenceId, item]),
    );
    const examplesByLexeme = new Map<string, Array<{ target: string; native: string }>>();
    for (const example of examples) {
      const localization = exampleLocalizationById.get(example.id);
      if (!localization) continue;
      const values = examplesByLexeme.get(example.lexemeId) ?? [];
      values.push({ target: example.displayText, native: localization.text });
      examplesByLexeme.set(example.lexemeId, values);
    }

    const projectionInputs: CanonicalDictionaryProjectionInput[] = [];
    for (const link of links) {
      const lexeme = lexemeById.get(link.lexemeId);
      const localization = localizationByLexeme.get(link.lexemeId);
      if (!lexeme || !localization || localization.status !== 'ready') {
        throw new ConflictException(`Podcast vocabulary ${link.lexemeId} is incomplete`);
      }
      projectionInputs.push({
        lexeme,
        localization,
        targetLocale: language.defaultLocale,
        examples: examplesByLexeme.get(link.lexemeId) ?? [],
      });
    }
    const results = await this.dictionaryProjection.projectMany(projectionInputs);
    if (results.length !== links.length) {
      throw new ConflictException('Dictionary projection returned an incomplete result');
    }
    const items = links.map((link, index) => ({
      lexemeId: link.lexemeId,
      dictionaryWordId: results[index].dictionaryWordId,
      position: link.position,
    }));
    return { items, results };
  }

  private counters(
    results: ReadonlyArray<{ reused: boolean; audio: 'reused' | 'generated' }>,
  ): PublicationCounters {
    return {
      dictionaryReused: results.filter(result => result.reused).length,
      dictionaryCreated: results.filter(result => !result.reused).length,
      audioReused: results.filter(result => result.audio === 'reused').length,
      audioGenerated: results.filter(result => result.audio === 'generated').length,
    };
  }

  private emptyCounters(): PublicationCounters {
    return { dictionaryReused: 0, dictionaryCreated: 0, audioReused: 0, audioGenerated: 0 };
  }

  private result(
    collection: PlatformCollectionEntity,
    created: boolean,
    essentialCount: number,
    counters: PublicationCounters,
  ): AdminPublishPodcastVocabularyResult {
    const model: AdminPlatformCollectionListItem = {
      id: collection.id,
      title: collection.title,
      titleTranslation: collection.titleTranslation ?? null,
      emoji: collection.emoji,
      coverImageUrl: collection.coverImageUrl,
      level: collection.level,
      topic: collection.topic,
      sourceLanguage: this.languageCode(collection.sourceLanguage),
      targetLanguage: this.languageCode(collection.targetLanguage),
      status: collection.isPublished ? 'published' : 'draft',
      wordCount: collection.wordCount,
      dictionaryLinked: collection.wordCount,
      isPublished: collection.isPublished,
      storyCategory: collection.storyCategory,
      createdAt: collection.createdAt?.toISOString() ?? collection.publishedAt?.toISOString() ?? '',
      updatedAt: collection.updatedAt?.toISOString() ?? collection.publishedAt?.toISOString() ?? '',
    };
    return { collection: model, created, essentialCount, ...counters };
  }

  private languageCode(value: string): AdminPlatformCollectionListItem['sourceLanguage'] {
    if (value === 'de' || value === 'en' || value === 'es' || value === 'fr'
      || value === 'it' || value === 'pt' || value === 'ja' || value === 'zh' || value === 'ko'
      || value === 'ru' || value === 'uk'
      || value === 'tr' || value === 'ar') return value;
    throw new ConflictException(`Unsupported language ${value}`);
  }

  private externalId(episodeExternalId: string): string {
    const candidate = `podcast-${episodeExternalId}-essential`;
    if (candidate.length <= 120) return candidate;
    const digest = createHash('sha256').update(candidate).digest('hex').slice(0, 12);
    return `${candidate.slice(0, 107)}-${digest}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof QueryFailedError
      && typeof error.driverError === 'object'
      && error.driverError !== null
      && 'code' in error.driverError
      && error.driverError.code === PG_UNIQUE_VIOLATION;
  }
}
