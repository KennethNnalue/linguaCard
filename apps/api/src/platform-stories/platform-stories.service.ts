import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  PlatformStory, PlatformStoryCard, UserStoryProgress,
  StoryDifficulty, StoryCategory, LanguageCode,
  Story, AdoptPlatformStoryResult,
} from '@lingua-card/shared/domain';
import { storyLengthFromWordCount } from '@lingua-card/shared/domain';
import { PlatformStoryEntity } from './platform-story.entity';
import { UserStoryProgressEntity } from './user-story-progress.entity';
import { StoryEntity } from '../stories/story.entity';

export interface PlatformStoryFilters {
  level?: StoryDifficulty;
  category?: StoryCategory;
  isFiction?: boolean;
  isPremium?: boolean;
  /** ISO code; when set, only stories whose nativeLang matches are returned. */
  nativeLang?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class PlatformStoriesService {
  constructor(
    @InjectRepository(PlatformStoryEntity)
    private readonly repo: Repository<PlatformStoryEntity>,
    @InjectRepository(UserStoryProgressEntity)
    private readonly progressRepo: Repository<UserStoryProgressEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
  ) {}

  async findAll(userId: string, filters: PlatformStoryFilters): Promise<{ stories: PlatformStoryCard[]; total: number }> {
    const qb = this.repo.createQueryBuilder('ps')
      .where('ps.isPublished = :pub', { pub: true });

    if (filters.level)     qb.andWhere('ps.level = :level',       { level: filters.level });
    if (filters.category)  qb.andWhere('ps.category = :category', { category: filters.category });
    if (filters.nativeLang) qb.andWhere('ps.nativeLang = :nativeLang', { nativeLang: filters.nativeLang });
    if (filters.isFiction !== undefined) qb.andWhere('ps.isFiction = :isFiction', { isFiction: filters.isFiction });
    if (filters.isPremium !== undefined) qb.andWhere('ps.isPremium = :isPremium', { isPremium: filters.isPremium });

    qb.orderBy('ps.publishedAt', 'DESC');

    const total = await qb.getCount();

    qb.limit(filters.limit ?? 20).offset(filters.offset ?? 0);

    const entities = await qb.getMany();
    const adoptedMap = await this.adoptedMapFor(userId, entities.map(e => e.id));
    return { stories: entities.map(e => this.toCard(e, adoptedMap)), total };
  }

  /** Map of platformStoryId → adopted user Story id, for the given candidate ids. */
  private async adoptedMapFor(userId: string, platformStoryIds: string[]): Promise<Map<string, string>> {
    if (!platformStoryIds.length) return new Map();
    const rows = await this.storyRepo.find({
      where: { userId, sourcePlatformStoryId: In(platformStoryIds) },
      select: { id: true, sourcePlatformStoryId: true },
    });
    return new Map(rows.map(r => [r.sourcePlatformStoryId as string, r.id]));
  }

  /**
   * Adopt a platform story into the user's own stories ("Add to my stories").
   * Idempotent: re-adopting returns the existing copy without inserting a duplicate.
   */
  async adopt(userId: string, platformStoryId: string): Promise<AdoptPlatformStoryResult> {
    const platform = await this.repo.findOneBy({ id: platformStoryId, isPublished: true });
    if (!platform) throw new NotFoundException(`Platform story ${platformStoryId} not found`);

    const existing = await this.storyRepo.findOneBy({ userId, sourcePlatformStoryId: platformStoryId });
    if (existing) {
      return { story: this.storyToModel(existing), created: false };
    }

    const entity = this.storyRepo.create({
      id: randomUUID(),
      userId,
      title: platform.title,
      titleTranslation: platform.titleTranslation,
      bodyDe: platform.bodyDe,
      bodyNative: platform.bodyNative,
      nativeLang: platform.nativeLang,
      sentences: platform.sentences,
      wordTimestamps: platform.wordTimestamps,
      vocabWords: [],
      audioUrl: platform.audioUrl,
      audioDurationMs: platform.audioDurationMs,
      sourceCollectionIds: [],
      difficultyLevel: platform.level,
      lengthType: platform.lengthType ?? storyLengthFromWordCount(platform.wordCount),
      listenCount: 0,
      lastListenedAt: null,
      coverImageUrl: platform.coverImageUrl,
      quizQuestions: platform.quizQuestions,
      grammarNotes: platform.grammarNotes,
      keywords: platform.keywords,
      isLearned: false,
      modelUsed: null,
      generationStatus: 'complete',
      sourcePlatformStoryId: platform.id,
    });

    try {
      const saved = await this.storyRepo.save(entity);
      return { story: this.storyToModel(saved), created: true };
    } catch (err) {
      // Lost a race with a concurrent adopt of the same platform story — the unique
      // index (uq_stories_user_source_platform) rejected the duplicate. Return the
      // row the winner inserted so the call stays idempotent.
      if (this.isUniqueViolation(err)) {
        const winner = await this.storyRepo.findOneBy({ userId, sourcePlatformStoryId: platformStoryId });
        if (winner) return { story: this.storyToModel(winner), created: false };
      }
      throw err;
    }
  }

  /** Postgres unique-constraint violation (SQLSTATE 23505). */
  private isUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as { code?: string }).code === '23505';
  }

  private storyToModel(e: StoryEntity): Story {
    return {
      id: e.id,
      userId: e.userId,
      title: e.title,
      titleTranslation: e.titleTranslation,
      bodyDe: e.bodyDe,
      bodyNative: e.bodyNative,
      nativeLang: e.nativeLang as LanguageCode,
      sentences: e.sentences,
      wordTimestamps: e.wordTimestamps,
      vocabWords: e.vocabWords,
      audioUrl: e.audioUrl,
      audioDurationMs: e.audioDurationMs,
      sourceCollectionIds: e.sourceCollectionIds,
      difficultyLevel: e.difficultyLevel,
      lengthType: e.lengthType,
      listenCount: e.listenCount,
      lastListenedAt: e.lastListenedAt,
      generatedAt: e.generatedAt instanceof Date ? e.generatedAt.toISOString() : e.generatedAt,
      coverImageUrl: e.coverImageUrl ?? null,
      quizQuestions: e.quizQuestions ?? [],
      grammarNotes: e.grammarNotes ?? [],
      keywords: e.keywords ?? [],
      isLearned: e.isLearned ?? false,
      generationStatus: e.generationStatus ?? 'complete',
      sourcePlatformStoryId: e.sourcePlatformStoryId ?? null,
    };
  }

  async findById(id: string): Promise<PlatformStory> {
    const entity = await this.repo.findOneBy({ id, isPublished: true });
    if (!entity) throw new NotFoundException(`Platform story ${id} not found`);
    return this.toModel(entity);
  }

  async getUserProgress(userId: string, storyId: string): Promise<UserStoryProgress | null> {
    const entity = await this.progressRepo.findOneBy({ userId, storyId });
    if (!entity) return null;
    return this.toProgressModel(entity);
  }

  async markAsRead(userId: string, storyId: string): Promise<void> {
    await this.ensureStoryExists(storyId);
    await this.progressRepo.upsert(
      { userId, storyId, isRead: true, lastReadAt: new Date().toISOString() },
      { conflictPaths: ['userId', 'storyId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async saveQuizScore(userId: string, storyId: string, score: number): Promise<void> {
    await this.ensureStoryExists(storyId);
    await this.progressRepo.upsert(
      { userId, storyId, quizScore: score },
      { conflictPaths: ['userId', 'storyId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async addSavedWord(userId: string, storyId: string, wordId: string): Promise<void> {
    await this.ensureStoryExists(storyId);
    let progress = await this.progressRepo.findOneBy({ userId, storyId });
    if (!progress) {
      progress = this.progressRepo.create({ userId, storyId, savedWordIds: [] });
    }
    if (!progress.savedWordIds.includes(wordId)) {
      progress.savedWordIds = [...progress.savedWordIds, wordId];
      await this.progressRepo.save(progress);
    }
  }

  async incrementReadCount(storyId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(PlatformStoryEntity)
      .set({ readCount: () => 'read_count + 1' })
      .where('id = :id', { id: storyId })
      .execute();
  }

  private async ensureStoryExists(storyId: string): Promise<void> {
    const exists = await this.repo.existsBy({ id: storyId, isPublished: true });
    if (!exists) throw new NotFoundException(`Platform story ${storyId} not found`);
  }

  private toCard(e: PlatformStoryEntity, adoptedMap: Map<string, string>): PlatformStoryCard {
    const adoptedStoryId = adoptedMap.get(e.id) ?? null;
    return {
      id: e.id,
      title: e.title,
      titleTranslation: e.titleTranslation,
      coverImageUrl: e.coverImageUrl ?? '',
      level: e.level,
      category: e.category,
      topics: e.topics,
      isFiction: e.isFiction,
      isPremium: e.isPremium,
      wordCount: e.wordCount,
      estimatedReadMinutes: e.estimatedReadMinutes,
      keywordCount: e.keywords?.length ?? 0,
      quizCount: e.quizQuestions?.length ?? 0,
      lengthType: e.lengthType ?? storyLengthFromWordCount(e.wordCount),
      adoptionStatus: adoptedStoryId ? 'adopted' : 'not-adopted',
      adoptedStoryId,
    };
  }

  private toModel(e: PlatformStoryEntity): PlatformStory {
    return {
      id: e.id,
      title: e.title,
      titleTranslation: e.titleTranslation,
      bodyDe: e.bodyDe,
      bodyNative: e.bodyNative,
      nativeLang: e.nativeLang as LanguageCode,
      sentences: e.sentences,
      wordTimestamps: e.wordTimestamps,
      keywords: e.keywords,
      quizQuestions: e.quizQuestions,
      grammarNotes: e.grammarNotes,
      audioUrl: e.audioUrl,
      audioDurationMs: e.audioDurationMs,
      coverImageUrl: e.coverImageUrl ?? '',
      level: e.level,
      category: e.category,
      topics: e.topics,
      isFiction: e.isFiction,
      isPremium: e.isPremium,
      wordCount: e.wordCount,
      estimatedReadMinutes: e.estimatedReadMinutes,
      publishedAt: e.publishedAt instanceof Date ? e.publishedAt.toISOString() : e.publishedAt,
      readCount: e.readCount,
      lengthType: e.lengthType ?? storyLengthFromWordCount(e.wordCount),
    };
  }

  private toProgressModel(e: UserStoryProgressEntity): UserStoryProgress {
    return {
      storyId: e.storyId,
      userId: e.userId,
      isRead: e.isRead,
      quizScore: e.quizScore,
      lastReadAt: e.lastReadAt,
      savedWordIds: e.savedWordIds,
    };
  }
}
