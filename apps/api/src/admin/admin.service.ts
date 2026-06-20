import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PlatformCollectionEntity } from './platform-collection.entity';
import { PlatformCollectionWordEntity } from './platform-collection-word.entity';
import { PlatformStoryEntity } from '../platform-stories/platform-story.entity';
import { UserStoryProgressEntity } from '../platform-stories/user-story-progress.entity';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import type {
  AdminImportCollectionDto,
  AdminImportCollectionResult,
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportStoryDto,
  AdminImportStoryResult,
  AdminPlatformCollectionListItem,
  AdminPlatformStoryListItem,
} from '@lingua-card/shared/domain';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(PlatformCollectionEntity)
    private readonly collectionRepo: Repository<PlatformCollectionEntity>,
    @InjectRepository(PlatformCollectionWordEntity)
    private readonly wordRepo: Repository<PlatformCollectionWordEntity>,
    @InjectRepository(PlatformStoryEntity)
    private readonly storyRepo: Repository<PlatformStoryEntity>,
    @InjectRepository(UserStoryProgressEntity)
    private readonly storyProgressRepo: Repository<UserStoryProgressEntity>,
    private readonly dictionary: WordDictionaryService,
  ) {}

  async importCollectionJson(dto: AdminImportCollectionJsonDto): Promise<AdminImportCollectionJsonResult> {
    const collectionId = crypto.randomUUID();
    let inserted = 0;
    let reused = 0;
    let audioLinked = 0;

    const wordRows: PlatformCollectionWordEntity[] = [];

    for (const word of dto.words) {
      const before = await this.dictionary.lookup(word.back, word.article, 'de-DE', 'en');
      const entity = await this.dictionary.persistEnriched(word, 'de-DE', 'en');
      if (before) {
        reused++;
      } else {
        inserted++;
        if (entity.wordAudioId) audioLinked++;
      }
      wordRows.push(
        this.wordRepo.create({
          id: randomUUID(),
          platformCollectionId: collectionId,
          dictionaryWordId: entity.id,
          position: wordRows.length,
        }),
      );
    }

    const collection = this.collectionRepo.create({
      id: collectionId,
      title: dto.title,
      emoji: dto.emoji ?? null,
      level: dto.level,
      topic: dto.topic,
      isPublished: false,
      wordCount: wordRows.length,
    });
    await this.collectionRepo.save(collection);
    await this.wordRepo.save(wordRows);

    return { collectionId, title: dto.title, inserted, reused, audioLinked };
  }

  async importCollection(dto: AdminImportCollectionDto): Promise<AdminImportCollectionResult> {
    const batchResult = await this.dictionary.batchResolve(dto.words, 'de-DE', 'en');

    const collectionId = crypto.randomUUID();
    const collection = this.collectionRepo.create({
      id: collectionId,
      title: dto.title,
      emoji: dto.emoji ?? null,
      level: dto.level,
      topic: dto.topic,
      isPublished: false,
      wordCount: batchResult.entries.length,
    });
    await this.collectionRepo.save(collection);

    const wordRows = batchResult.entries.map((entry, i) =>
      this.wordRepo.create({
        id: crypto.randomUUID(),
        platformCollectionId: collectionId,
        dictionaryWordId: entry.id,
        position: i,
      }),
    );
    await this.wordRepo.save(wordRows);

    return {
      collectionId,
      title: dto.title,
      created: batchResult.entries.length,
      reused: batchResult.reused,
      enriched: batchResult.enriched,
    };
  }

  async importStory(dto: AdminImportStoryDto): Promise<AdminImportStoryResult> {
    const { story } = dto;

    // Map story keywords through dictionary (lookup only — no enrichment for admin import)
    const keywordEntries = await Promise.all(
      story.keywords.map(kw =>
        this.dictionary.lookup(kw.germanBase, kw.article, 'de-DE', 'en'),
      ),
    );

    const sentences = story.sentences.map((s, i) => ({
      id: `s-${i}`,
      german: s.german,
      native: s.native,
      position: i,
    }));

    const keywords = story.keywords.map((kw, i) => ({
      id: `kw-${i}`,
      word: kw.germanBase,
      article: kw.article,
      translation: kw.translation,
      wordType: kw.wordType,
      dictionaryWordId: keywordEntries[i]?.id ?? null,
    }));

    const storyId = crypto.randomUUID();
    const totalWords = story.sentences.reduce((acc, s) => acc + s.german.split(/\s+/).length, 0);
    const entity = Object.assign(new PlatformStoryEntity(), {
      id: storyId,
      title: story.title,
      titleTranslation: story.titleTranslation,
      bodyDe: story.sentences.map(s => s.german).join(' '),
      bodyNative: story.sentences.map(s => s.native).join(' '),
      nativeLang: 'en',
      sentences,
      keywords,
      wordTimestamps: [],
      quizQuestions: [],
      grammarNotes: [],
      audioUrl: null,
      audioDurationMs: 0,
      coverImageUrl: null,
      level: story.level as string,
      category: story.topic as string,
      topics: [story.topic],
      isFiction: dto.isFiction ?? true,
      isPremium: false,
      wordCount: totalWords,
      estimatedReadMinutes: Math.max(1, Math.round(totalWords / 80)),
      readCount: 0,
      isPublished: false,
      platformCollectionId: dto.platformCollectionId,
    });
    await this.storyRepo.save(entity);

    return {
      storyId,
      title: story.title,
      sentenceCount: story.sentences.length,
      keywordsResolved: keywordEntries.filter(e => e !== null).length,
    };
  }

  async listCollections(): Promise<AdminPlatformCollectionListItem[]> {
    const collections = await this.collectionRepo.find({ order: { createdAt: 'DESC' } });
    const ids = collections.map(c => c.id);
    if (!ids.length) return [];

    const reuseCounts: Array<{ platformCollectionId: string; reused: number }> =
      await this.wordRepo.manager.query(
        `SELECT pcw."platformCollectionId",
                COUNT(DISTINCT wd."id")::int AS reused
         FROM platform_collection_words pcw
         JOIN word_dictionary wd ON wd.id = pcw."dictionaryWordId"
         WHERE pcw."platformCollectionId" = ANY($1::text[])
         GROUP BY pcw."platformCollectionId"`,
        [ids],
      );
    const reuseMap = new Map(reuseCounts.map(r => [r.platformCollectionId, r.reused]));

    return collections.map(c => ({
      id: c.id,
      title: c.title,
      emoji: c.emoji,
      level: c.level,
      topic: c.topic,
      wordCount: c.wordCount,
      dictionaryLinked: reuseMap.get(c.id) ?? 0,
      isPublished: c.isPublished,
      storyCategory: c.storyCategory ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    }));
  }

  async setPublished(id: string, isPublished: boolean): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    entity.isPublished = isPublished;
    await this.collectionRepo.save(entity);
  }

  async setStoryCategory(id: string, storyCategory: string | null): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    entity.storyCategory = storyCategory;
    await this.collectionRepo.save(entity);
  }

  async listStories(): Promise<AdminPlatformStoryListItem[]> {
    const stories = await this.storyRepo.find({ order: { publishedAt: 'DESC' } });
    return stories.map(s => ({
      id: s.id,
      title: s.title,
      titleTranslation: s.titleTranslation,
      level: s.level,
      category: s.category,
      wordCount: s.wordCount,
      isPublished: s.isPublished,
      platformCollectionId: s.platformCollectionId,
      publishedAt: s.publishedAt instanceof Date ? s.publishedAt.toISOString() : String(s.publishedAt),
    }));
  }

  async deleteCollection(id: string): Promise<void> {
    const entity = await this.collectionRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform collection ${id} not found`);
    // Remove member word links, then detach any stories paired to this collection.
    await this.wordRepo.delete({ platformCollectionId: id });
    await this.storyRepo.update({ platformCollectionId: id }, { platformCollectionId: null });
    await this.collectionRepo.delete({ id });
  }

  async deleteStory(id: string): Promise<void> {
    const entity = await this.storyRepo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Platform story ${id} not found`);
    // Remove per-user progress rows referencing this story before deleting it.
    await this.storyProgressRepo.delete({ storyId: id });
    await this.storyRepo.delete({ id });
  }
}
