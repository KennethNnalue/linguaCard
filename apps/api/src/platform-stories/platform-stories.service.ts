import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  PlatformStory, PlatformStoryCard, UserStoryProgress,
  StoryDifficulty, StoryCategory,
} from '@lingua-card/shared/domain';
import { PlatformStoryEntity } from './platform-story.entity';
import { UserStoryProgressEntity } from './user-story-progress.entity';

export interface PlatformStoryFilters {
  level?: StoryDifficulty;
  category?: StoryCategory;
  isFiction?: boolean;
  isPremium?: boolean;
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
  ) {}

  async findAll(filters: PlatformStoryFilters): Promise<{ stories: PlatformStoryCard[]; total: number }> {
    const qb = this.repo.createQueryBuilder('ps')
      .where('ps.isPublished = :pub', { pub: true });

    if (filters.level)     qb.andWhere('ps.level = :level',       { level: filters.level });
    if (filters.category)  qb.andWhere('ps.category = :category', { category: filters.category });
    if (filters.isFiction !== undefined) qb.andWhere('ps.isFiction = :isFiction', { isFiction: filters.isFiction });
    if (filters.isPremium !== undefined) qb.andWhere('ps.isPremium = :isPremium', { isPremium: filters.isPremium });

    qb.orderBy('ps.publishedAt', 'DESC');

    const total = await qb.getCount();

    qb.limit(filters.limit ?? 20).offset(filters.offset ?? 0);

    const entities = await qb.getMany();
    return { stories: entities.map(this.toCard), total };
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

  private toCard(e: PlatformStoryEntity): PlatformStoryCard {
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
    };
  }

  private toModel(e: PlatformStoryEntity): PlatformStory {
    return {
      id: e.id,
      title: e.title,
      titleTranslation: e.titleTranslation,
      bodyDe: e.bodyDe,
      bodyEn: e.bodyEn,
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
