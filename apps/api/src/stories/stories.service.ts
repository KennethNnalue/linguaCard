import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Story, GenerateStoryDto } from '@lingua-card/shared/domain';
import { StoryEntity } from './story.entity';
import { StoryGenerationService } from './story-generation.service';
import { SEED_STORY } from './seed/seed-story';

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(StoryEntity)
    private readonly repo: Repository<StoryEntity>,
    private readonly generation: StoryGenerationService,
  ) {}

  async findAll(userId: string): Promise<Story[]> {
    const entities = await this.repo.find({
      where: { userId },
      order: { generatedAt: 'DESC' },
    });
    return entities.map(this.toModel);
  }

  async findOne(userId: string, id: string): Promise<Story> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);
    return this.toModel(entity);
  }

  async generate(userId: string, dto: GenerateStoryDto): Promise<Story> {
    return this.generation.generateAndSave(userId, dto);
  }

  /** Dev-only: seed a static story without calling the AI APIs */
  async seedStory(userId: string): Promise<Story> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId,
      ...SEED_STORY,
      listenCount: 0,
      lastListenedAt: null,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException(`Story ${id} not found`);
  }

  async recordListen(userId: string, id: string): Promise<void> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);
    entity.listenCount += 1;
    entity.lastListenedAt = new Date().toISOString();
    await this.repo.save(entity);
  }

  private toModel(e: StoryEntity): Story {
    return {
      id: e.id,
      userId: e.userId,
      title: e.title,
      titleTranslation: e.titleTranslation,
      bodyDe: e.bodyDe,
      bodyEn: e.bodyEn,
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
    };
  }
}
