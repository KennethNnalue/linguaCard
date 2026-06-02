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
import { AnthropicAdapter } from '../ai/providers/anthropic.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import type { AiConfig } from '../config/ai.config';

// TODO(LC-123): replace with SubscriptionService.getEffectiveTier(userId) once subscription epic (LC-103-118) is implemented.
type SubscriptionTier = 'pro' | 'free';
function stubGetTier(_userId: string): SubscriptionTier { return 'pro'; }

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

  private readonly storyModelPro:  string;
  private readonly storyModelFree: string;

  constructor(
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
    private readonly promptBuilder: StoryPromptBuilder,
    private readonly anthropic:   AnthropicAdapter,
    private readonly gemini:      GeminiAdapter,
    private readonly openRouter:  OpenRouterAdapter,
    private readonly config:      ConfigService,
    private readonly audioService: StoryAudioService,
    private readonly vocabMapper: StoryVocabMapper,
  ) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.storyModelPro  = ai.storyModelPro;
    this.storyModelFree = ai.storyModelFree;
    this.logger.log(`Story models — Pro: ${this.storyModelPro} | Free: ${this.storyModelFree}`);
  }

  private modelForTier(tier: SubscriptionTier): string {
    return tier === 'pro' ? this.storyModelPro : this.storyModelFree;
  }

  async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
    const cards = await this.cardRepo.find({
      where: { userId, collectionId: In(dto.collectionIds) },
    });

    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    const tier  = stubGetTier(userId);
    const model = this.modelForTier(tier);
    this.logger.log(`Generating story for userId=${userId} tier=${tier} model=${model}`);

    const content = await this.generateTextWithModel(dto, cards, model);

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
      this.generateQuizQuestions(sentences, dto.difficulty, model),
      this.generateGrammarNotes(sentences, dto.difficulty, model),
      this.generateKeywords(sentences, dto.difficulty, model),
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
      modelUsed: model,
    });

    const saved = await this.storyRepo.save(entity);
    return this.toModel(saved);
  }

  private async generateQuizQuestions(
    sentences: StorySentence[],
    difficulty: string,
    model: string,
  ): Promise<StoryQuizQuestion[]> {
    try {
      const prompt = this.promptBuilder.buildQuizPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildQuizPrompt>[1]);
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 2048,
        model,
      });
      const clean = (response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? response.text).trim();
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
    model: string,
  ): Promise<StoryGrammarNote[]> {
    try {
      const prompt = this.promptBuilder.buildGrammarPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildGrammarPrompt>[1]);
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 3072,
        model,
      });
      const clean = (response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? response.text).trim();
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
    model: string,
  ): Promise<StoryKeyword[]> {
    try {
      const prompt = this.promptBuilder.buildKeywordsPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildKeywordsPrompt>[1]);
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 2048,
        model,
      });
      const clean = (response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? response.text).trim();
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
    const enrichModel = this.modelForTier(stubGetTier(userId));

    const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
      (entity.quizQuestions ?? []).length === 0
        ? this.generateQuizQuestions(sentences, difficulty, enrichModel)
        : Promise.resolve(entity.quizQuestions!),
      (entity.grammarNotes ?? []).length === 0
        ? this.generateGrammarNotes(sentences, difficulty, enrichModel)
        : Promise.resolve(entity.grammarNotes!),
      (entity.keywords ?? []).length === 0
        ? this.generateKeywords(sentences, difficulty, enrichModel)
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

  private async generateTextWithModel(
    dto: GenerateStoryDto,
    cards: CardEntity[],
    model: string,
  ): Promise<GeneratedStoryContent> {
    const prompt = this.promptBuilder.build(dto, cards);

    let rawText: string;
    try {
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 8192,
        model,
      });
      rawText = response.text;
      this.logger.log(`Story generated | model=${response.model} | ${response.inputTokens}in/${response.outputTokens}out tokens`);
    } catch (err) {
      this.logger.error('AI text generation error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }

    const clean = (rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? rawText).trim();
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
      modelUsed: e.modelUsed ?? null,
    };
  }
}
