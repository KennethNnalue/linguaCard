import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformStoryEntity } from '../platform-story.entity';
import { PLATFORM_STORIES_SEED } from './platform-stories-seed-data';

@Injectable()
export class PlatformStoriesSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformStoriesSeedService.name);

  constructor(
    @InjectRepository(PlatformStoryEntity)
    private readonly repo: Repository<PlatformStoryEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPlatformStories();
  }

  private async seedPlatformStories(): Promise<void> {
    const existingIds = await this.repo
      .createQueryBuilder('ps')
      .select('ps.id')
      .getMany()
      .then(rows => new Set(rows.map(r => r.id)));

    const toInsert = PLATFORM_STORIES_SEED.filter(s => !existingIds.has(s.id));

    if (toInsert.length === 0) {
      this.logger.log('Platform stories already seeded — skipping.');
      return;
    }

    for (const seed of toInsert) {
      const entity = this.repo.create({
        id: seed.id,
        title: seed.title,
        titleTranslation: seed.titleTranslation,
        bodyDe: seed.bodyDe,
        bodyNative: seed.bodyNative,
        nativeLang: 'en',
        sentences: seed.sentences,
        wordTimestamps: [],
        keywords: seed.keywords,
        quizQuestions: seed.quizQuestions,
        grammarNotes: seed.grammarNotes,
        audioUrl: null,
        audioDurationMs: 0,
        coverImageUrl: null,
        level: seed.level,
        category: seed.category,
        topics: seed.topics,
        isFiction: seed.isFiction,
        isPremium: seed.isPremium,
        wordCount: seed.wordCount,
        estimatedReadMinutes: seed.estimatedReadMinutes,
        readCount: 0,
        isPublished: true,
      });

      await this.repo.save(entity);
      this.logger.log(`Seeded platform story: "${seed.title}" (${seed.level}, ${seed.category})`);
    }

    this.logger.log(`Platform stories seed complete: ${toInsert.length} stories added.`);
  }
}
