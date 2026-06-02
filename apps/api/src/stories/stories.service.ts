import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Story, GenerateStoryDto } from '@lingua-card/shared/domain';
import { StoryEntity } from './story.entity';
import { StoryGenerationService } from './story-generation.service';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import { StorageService } from '../storage/storage.service';
import { SEED_STORY } from './seed/seed-story';

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(StoryEntity)
    private readonly repo: Repository<StoryEntity>,
    private readonly generation: StoryGenerationService,
    private readonly audioService: StoryAudioService,
    private readonly vocabMapper: StoryVocabMapper,
    private readonly storage: StorageService,
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
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);

    // Delete audio file from R2 / local disk before removing the DB row
    if (entity.audioUrl) {
      const storagePath = this.extractStoragePath(entity.audioUrl);
      if (storagePath) await this.storage.delete(storagePath);
    }

    await this.repo.delete({ id, userId });
  }

  // Extracts the relative storage key from a full URL.
  // e.g. "https://pub-xxx.r2.dev/stories/abc.wav" → "stories/abc.wav"
  //      "http://localhost:3001/uploads/stories/abc.wav" → "stories/abc.wav"
  private extractStoragePath(audioUrl: string): string | null {
    try {
      const url = new URL(audioUrl);
      // Strip leading /uploads/ prefix (local disk) or just leading / (R2)
      const pathname = url.pathname.replace(/^\/uploads\//, '').replace(/^\//, '');
      return pathname || null;
    } catch {
      return null;
    }
  }

  async generateAudio(userId: string, id: string): Promise<Story> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);

    const { audioUrl, timestamps, durationMs } =
      await this.audioService.generateAudioWithTimestamps(entity.bodyDe, id);

    const markedTimestamps = this.vocabMapper.markVocabWords(timestamps, entity.vocabWords ?? []);

    entity.audioUrl = audioUrl;
    entity.audioDurationMs = durationMs;
    entity.wordTimestamps = markedTimestamps;

    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async recordListen(userId: string, id: string): Promise<void> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);
    entity.listenCount += 1;
    entity.lastListenedAt = new Date().toISOString();
    await this.repo.save(entity);
  }

  async enrich(userId: string, id: string): Promise<Story> {
    return this.generation.enrichExisting(userId, id);
  }

  async extend(userId: string, id: string): Promise<Story> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);
    if (entity.generationStatus !== 'partial') {
      return this.toModel(entity);
    }
    return this.generation.extendStory(entity);
  }

  async setLearned(userId: string, id: string, isLearned: boolean): Promise<Story> {
    const entity = await this.repo.findOneBy({ id, userId });
    if (!entity) throw new NotFoundException(`Story ${id} not found`);
    entity.isLearned = isLearned;
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
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
      coverImageUrl: e.coverImageUrl ?? null,
      quizQuestions: e.quizQuestions ?? [],
      grammarNotes: e.grammarNotes ?? [],
      keywords: e.keywords ?? [],
      isLearned: e.isLearned ?? false,
      generationStatus: (e.generationStatus ?? 'complete'),
    };
  }
}
