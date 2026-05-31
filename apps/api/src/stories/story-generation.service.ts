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
  StoryQuizQuestion,
  StoryGrammarNote,
  StoryKeyword,
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

    // Generate quiz, grammar, and keywords concurrently — failures don't block save
    const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
      this.generateQuizQuestions(sentences, dto.difficulty),
      this.generateGrammarNotes(sentences, dto.difficulty),
      this.generateKeywords(sentences, dto.difficulty),
    ]);

    // Merge AI keywords with vault words (vault words get their cardId set)
    const keywords: StoryKeyword[] = this.mergeKeywords(aiKeywords, vocabWords);

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
      quizQuestions,
      grammarNotes,
      keywords,
      audioUrl,
      audioDurationMs: durationMs,
      sourceCollectionIds: dto.collectionIds,
      difficultyLevel: dto.difficulty,
      lengthType: dto.length,
      listenCount: 0,
      lastListenedAt: null,
      coverImageUrl: null,
      isLearned: false,
    });

    const saved = await this.storyRepo.save(entity);
    return this.toModel(saved);
  }

  private async generateQuizQuestions(
    sentences: StorySentence[],
    difficulty: string,
  ): Promise<StoryQuizQuestion[]> {
    try {
      const prompt = this.promptBuilder.buildQuizPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildQuizPrompt>[1]);
      const response = await this.textProvider.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2048,
      });
      const clean = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(clean) as StoryQuizQuestion[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.warn('Quiz generation failed, story saved without quiz', err);
      return [];
    }
  }

  private async generateGrammarNotes(
    sentences: StorySentence[],
    difficulty: string,
  ): Promise<StoryGrammarNote[]> {
    try {
      const prompt = this.promptBuilder.buildGrammarPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildGrammarPrompt>[1]);
      const response = await this.textProvider.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 3072,
      });
      const clean = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(clean) as StoryGrammarNote[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.warn('Grammar notes generation failed, story saved without grammar notes', err);
      return [];
    }
  }

  private async generateKeywords(
    sentences: StorySentence[],
    difficulty: string,
  ): Promise<StoryKeyword[]> {
    try {
      const prompt = this.promptBuilder.buildKeywordsPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildKeywordsPrompt>[1]);
      const response = await this.textProvider.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2048,
      });
      const clean = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(clean) as StoryKeyword[];
      return Array.isArray(parsed) ? parsed.map(k => ({ ...k, cardId: null })) : [];
    } catch (err) {
      this.logger.warn('Keyword generation failed, story saved without keywords', err);
      return [];
    }
  }

  /**
   * Generates quiz, grammar notes, and keywords for an existing story that was
   * saved before enrichment was supported. Persists results to the DB and
   * returns the updated Story model.
   */
  async enrichExisting(userId: string, id: string): Promise<Story> {
    const entity = await this.storyRepo.findOneBy({ id, userId });
    if (!entity) {
      throw new Error(`Story ${id} not found`);
    }

    // Only enrich if at least one section is empty
    const needsEnrichment =
      (entity.quizQuestions ?? []).length === 0 ||
      (entity.grammarNotes ?? []).length === 0 ||
      (entity.keywords ?? []).length === 0;

    if (!needsEnrichment) {
      return this.toModel(entity);
    }

    const sentences: StorySentence[] = entity.sentences ?? [];
    const difficulty = entity.difficultyLevel ?? 'A2';

    const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
      (entity.quizQuestions ?? []).length === 0
        ? this.generateQuizQuestions(sentences, difficulty)
        : Promise.resolve(entity.quizQuestions!),
      (entity.grammarNotes ?? []).length === 0
        ? this.generateGrammarNotes(sentences, difficulty)
        : Promise.resolve(entity.grammarNotes!),
      (entity.keywords ?? []).length === 0
        ? this.generateKeywords(sentences, difficulty)
        : Promise.resolve(entity.keywords!),
    ]);

    const keywords: StoryKeyword[] = this.mergeKeywords(aiKeywords, entity.vocabWords ?? []);

    entity.quizQuestions = quizQuestions;
    entity.grammarNotes = grammarNotes;
    entity.keywords = keywords;

    const saved = await this.storyRepo.save(entity);
    return this.toModel(saved);
  }

  private mergeKeywords(aiKeywords: StoryKeyword[], vocabWords: StoryVocabWord[]): StoryKeyword[] {
    const merged = [...aiKeywords];
    // Stamp cardId onto any keyword that matches a vault word
    for (const kw of merged) {
      const match = vocabWords.find(
        v => v.germanBase.toLowerCase() === kw.germanBase.toLowerCase(),
      );
      if (match) kw.cardId = match.cardId;
    }
    // Add vault words not already present in AI list
    for (const v of vocabWords) {
      const exists = merged.some(
        k => k.germanBase.toLowerCase() === v.germanBase.toLowerCase(),
      );
      if (!exists) {
        merged.push({
          cardId: v.cardId,
          german: v.german,
          germanBase: v.germanBase,
          english: v.english,
          article: v.article,
          wordType: 'noun',
          level: 'A2',
        });
      }
    }
    const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    return merged.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
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
      coverImageUrl: e.coverImageUrl ?? null,
      quizQuestions: e.quizQuestions ?? [],
      grammarNotes: e.grammarNotes ?? [],
      keywords: e.keywords ?? [],
      isLearned: e.isLearned ?? false,
    };
  }
}
