import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  GenerateStoryDto,
  Story,
  StoryVocabWord,
  StorySentence,
} from '@lingua-card/shared/domain';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from './story.entity';
import { AnthropicAdapter, type AITextRequest } from '../ai/providers/anthropic.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import type { AiConfig } from '../config/ai.config';

interface GeneratedSentence {
  german: string;
  english: string;
  vocabWordsUsed: string[];
}

interface GeneratedStoryContent {
  title: string;
  titleTranslation: string;
  sentences: GeneratedSentence[];
}

@Injectable()
export class StoryGenerationService {
  private readonly logger = new Logger(StoryGenerationService.name);

  constructor(
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
    private readonly promptBuilder: StoryPromptBuilder,
    private readonly anthropic: AnthropicAdapter,
    private readonly gemini: GeminiAdapter,
    private readonly config: ConfigService,
    private readonly audioService: StoryAudioService,
    private readonly vocabMapper: StoryVocabMapper,
  ) {}

  private get textProvider(): { generateText(r: AITextRequest): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }> } {
    const provider = this.config.get<AiConfig>('ai')!.defaultProvider;
    if (provider === 'gemini') return this.gemini;
    return this.anthropic;
  }

  async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
    const cards = await this.cardRepo.find({
      where: { userId, collectionId: In(dto.collectionIds) },
    });

    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    const content = await this.generateText(dto, cards);

    const vocabWords: StoryVocabWord[] = cards.map(card => ({
      cardId: card.id,
      german: card.content.article
        ? `${card.content.article} ${card.content.back}`
        : card.content.back,
      germanBase: card.content.back,
      english: card.content.front,
      article: card.content.article as 'der' | 'die' | 'das' | null,
      sentenceIndices: content.sentences
        .map((s, i) => ({ i, used: s.vocabWordsUsed.includes(card.content.back) }))
        .filter(x => x.used)
        .map(x => x.i),
    }));

    const bodyDe = content.sentences.map(s => s.german).join(' ');
    const bodyEn = content.sentences.map(s => s.english).join(' ');
    const storyId = randomUUID();

    const { audioUrl, timestamps, durationMs } =
      await this.audioService.generateAudioWithTimestamps(bodyDe, storyId);

    const markedTimestamps = this.vocabMapper.markVocabWords(timestamps, vocabWords);

    const sentences: StorySentence[] = content.sentences.map((s, i) => ({
      index: i,
      german: s.german,
      english: s.english,
      vocabWordIds: vocabWords
        .filter(v => v.sentenceIndices.includes(i))
        .map(v => v.cardId),
    }));

    const entity = this.storyRepo.create({
      id: storyId,
      userId,
      title: content.title,
      titleTranslation: content.titleTranslation,
      bodyDe,
      bodyEn,
      sentences,
      wordTimestamps: markedTimestamps,
      vocabWords,
      audioUrl,
      audioDurationMs: durationMs,
      sourceCollectionIds: dto.collectionIds,
      difficultyLevel: dto.difficulty,
      lengthType: dto.length,
      listenCount: 0,
      lastListenedAt: null,
    });

    const saved = await this.storyRepo.save(entity);
    return this.toModel(saved);
  }

  private async generateText(
    dto: GenerateStoryDto,
    cards: CardEntity[],
  ): Promise<GeneratedStoryContent> {
    const prompt = this.promptBuilder.build(dto, cards);

    let rawText: string;
    try {
      const response = await this.textProvider.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 8192,
      });
      rawText = response.text;
      this.logger.log(`Story generated via ${response.model} (${response.inputTokens} in / ${response.outputTokens} out tokens)`);
    } catch (err) {
      this.logger.error('AI text generation error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }

    const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      return JSON.parse(clean) as GeneratedStoryContent;
    } catch {
      this.logger.error('JSON parse failed. Raw response:', rawText);
      throw new InternalServerErrorException('Story generation returned invalid data.');
    }
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
