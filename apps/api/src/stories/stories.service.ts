import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  Story, GenerateStoryDto,
  StorySentence, WordTimestamp, StoryVocabWord,
} from '@lingua-card/shared/domain';
import { StoryEntity } from './story.entity';

// Seed story used for mock generation (no AI/TTS keys yet)
const SEED_STORY: Omit<Story, 'id' | 'userId' | 'generatedAt' | 'listenCount' | 'lastListenedAt'> = {
  title: 'Ein Abend im Biergarten',
  titleTranslation: 'An Evening at the Beer Garden',
  bodyDe: 'Es war ein warmer Sommerabend als Thomas und Maria beschlossen, in den Biergarten zu gehen. Ich habe großen Hunger und Durst, sagte Thomas lachend. Der Kellner brachte ihnen sofort die Speisekarte. Maria betrachtete sie sorgfältig. Ich bestelle das Schnitzel, sagte sie. Thomas wählte die Tomatensuppe und eine Schorle. Am Ende des Abends bezahlten sie die Rechnung und gaben dem Kellner ein großzügiges Trinkgeld.',
  bodyEn: 'It was a warm summer evening when Thomas and Maria decided to go to the beer garden. I am very hungry and thirsty, said Thomas, laughing. The waiter immediately brought them the menu. Maria looked at it carefully. I will order the schnitzel, she said. Thomas chose the tomato soup and a sparkling water. At the end of the evening they paid the bill and gave the waiter a generous tip.',
  sentences: [
    { index: 0, german: 'Es war ein warmer Sommerabend als Thomas und Maria beschlossen, in den Biergarten zu gehen.', english: 'It was a warm summer evening when Thomas and Maria decided to go to the beer garden.', vocabWordIds: [] },
    { index: 1, german: 'Ich habe großen Hunger und Durst, sagte Thomas lachend.', english: 'I am very hungry and thirsty, said Thomas, laughing.', vocabWordIds: [] },
    { index: 2, german: 'Der Kellner brachte ihnen sofort die Speisekarte.', english: 'The waiter immediately brought them the menu.', vocabWordIds: [] },
    { index: 3, german: 'Ich bestelle das Schnitzel, sagte sie.', english: 'I will order the schnitzel, she said.', vocabWordIds: [] },
    { index: 4, german: 'Thomas wählte die Tomatensuppe und eine Schorle.', english: 'Thomas chose the tomato soup and a sparkling water.', vocabWordIds: [] },
    { index: 5, german: 'Am Ende des Abends bezahlten sie die Rechnung und gaben dem Kellner ein großzügiges Trinkgeld.', english: 'At the end of the evening they paid the bill and gave the waiter a generous tip.', vocabWordIds: [] },
  ] as StorySentence[],
  wordTimestamps: [] as WordTimestamp[],
  vocabWords: [
    { cardId: '', german: 'der Biergarten', germanBase: 'Biergarten', english: 'beer garden', article: 'der', sentenceIndices: [0] },
    { cardId: '', german: 'der Hunger', germanBase: 'Hunger', english: 'hunger', article: 'der', sentenceIndices: [1] },
    { cardId: '', german: 'der Durst', germanBase: 'Durst', english: 'thirst', article: 'der', sentenceIndices: [1] },
    { cardId: '', german: 'die Speisekarte', germanBase: 'Speisekarte', english: 'menu', article: 'die', sentenceIndices: [2] },
    { cardId: '', german: 'bestellen', germanBase: 'bestellen', english: 'to order', article: null, sentenceIndices: [3] },
    { cardId: '', german: 'das Schnitzel', germanBase: 'Schnitzel', english: 'schnitzel', article: 'das', sentenceIndices: [3] },
    { cardId: '', german: 'die Tomatensuppe', germanBase: 'Tomatensuppe', english: 'tomato soup', article: 'die', sentenceIndices: [4] },
    { cardId: '', german: 'die Schorle', germanBase: 'Schorle', english: 'spritzer / sparkling water', article: 'die', sentenceIndices: [4] },
    { cardId: '', german: 'bezahlen', germanBase: 'bezahlen', english: 'to pay', article: null, sentenceIndices: [5] },
    { cardId: '', german: 'die Rechnung', germanBase: 'Rechnung', english: 'bill / invoice', article: 'die', sentenceIndices: [5] },
    { cardId: '', german: 'das Trinkgeld', germanBase: 'Trinkgeld', english: 'tip (gratuity)', article: 'das', sentenceIndices: [5] },
  ] as StoryVocabWord[],
  audioUrl: null,
  audioDurationMs: 15000,
  sourceCollectionIds: [],
  difficultyLevel: 'A2',
  lengthType: 'medium',
};

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(StoryEntity)
    private readonly repo: Repository<StoryEntity>,
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
    const entity = this.repo.create({
      id: randomUUID(),
      userId,
      ...SEED_STORY,
      sourceCollectionIds: dto.collectionIds,
      difficultyLevel: dto.difficulty,
      lengthType: dto.length,
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
