import { Injectable, Logger, BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  GenerateStoryDto,
  LanguageCode,
  Story,
  StoryVocabWord,
  StorySentence,
  StoryQuizQuestion,
  StoryGrammarNote,
  StoryKeyword,
  SubscriptionTier,
} from '@lingua-card/shared/domain';
import { recoverStoryContent } from './story-json-recovery.util';
import { normalizeStorySentences, resolveBodyNative } from './story-sentence.util';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from './story.entity';
import { AnthropicAdapter } from '../ai/providers/anthropic.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import { UserSettingsService } from '../settings/user-settings.service';
import type { AiConfig } from '../config/ai.config';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', tr: 'Turkish',
  uk: 'Ukrainian', ru: 'Russian', ar: 'Arabic',
};

const MIN_RECOVERABLE_SENTENCES = 5;

/**
 * Loosely-typed object parsed from an LLM JSON response. Every field is `unknown`
 * and must be validated before use — the `parseEnrichmentSections` validators do
 * exactly that. Listing the fields explicitly (rather than an index signature)
 * keeps `noPropertyAccessFromIndexSignature` happy while staying type-safe.
 */
interface RawRecord {
  id?: unknown;
  sentenceTemplate?: unknown;
  correctAnswer?: unknown;
  distractors?: unknown;
  audioSentence?: unknown;
  hint?: unknown;
  title?: unknown;
  description?: unknown;
  exampleDe?: unknown;
  exampleNative?: unknown;
  conjugationTable?: unknown;
  additionalExamples?: unknown;
  pronoun?: unknown;
  form?: unknown;
  de?: unknown;
  native?: unknown;
  german?: unknown;
  germanBase?: unknown;
  translation?: unknown;
  article?: unknown;
  wordType?: unknown;
  level?: unknown;
}

interface GeneratedSentence {
  german: string;
  native: string;
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
    private readonly config:        ConfigService,
    private readonly audioService:  StoryAudioService,
    private readonly vocabMapper:   StoryVocabMapper,
    private readonly subscriptions: SubscriptionService,
    private readonly dictionary: WordDictionaryService,
    private readonly userSettings: UserSettingsService,
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
    const status = await this.subscriptions.getStatusForUser(userId);

    if (!status.isActive && status.storiesRemaining !== null && status.storiesRemaining <= 0) {
      throw new ForbiddenException('Story limit reached. Upgrade to Pro for unlimited stories.');
    }

    const cards = await this.cardRepo.find({
      where: { userId, collectionId: In(dto.collectionIds) },
    });

    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    const tier  = status.isActive ? 'pro' : 'free';
    const model = this.modelForTier(tier);

    const settings = await this.userSettings.getForUser(userId);
    const nativeLangName = LANGUAGE_NAMES[settings.uiLanguage] ?? 'English';

    this.logger.log(`Generating story for userId=${userId} tier=${tier} model=${model} nativeLang=${nativeLangName}`);

    const generated = await this.generateStoryWithEnrichment(dto, cards, model, nativeLangName);
    const { content, isPartial } = generated;

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
    const bodyNative = content.sentences.map(s => s.native).join(' ');
    const storyId = randomUUID();

    const { audioUrl, timestamps, durationMs } =
      await this.audioService.generateAudioWithTimestamps(bodyDe, storyId);

    const markedTimestamps = this.vocabMapper.markVocabWords(timestamps, vocabWords);

    const sentences: StorySentence[] = content.sentences.map((s, i) => ({
      index: i,
      german: s.german,
      native: s.native,
      vocabWordIds: vocabWords
        .filter(v => v.sentenceIndices.includes(i))
        .map(v => v.cardId),
    }));

    // The combined call usually returns quiz/grammar/keywords inline (no extra LLM
    // calls). Only generate a section separately when the combined response omitted
    // it (empty), or for the extra-long path which generates story text only.
    const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
      generated.quizQuestions.length
        ? Promise.resolve(generated.quizQuestions)
        : this.generateQuizQuestions(sentences, dto.difficulty, model, nativeLangName),
      generated.grammarNotes.length
        ? Promise.resolve(generated.grammarNotes)
        : this.generateGrammarNotes(sentences, dto.difficulty, model, nativeLangName),
      generated.keywords.length
        ? Promise.resolve(generated.keywords)
        : this.generateKeywords(sentences, dto.difficulty, model, nativeLangName),
    ]);

    // Merge AI keywords with vault words; enrich known words from dictionary
    const merged = this.mergeKeywords(aiKeywords, vocabWords);
    const keywords: StoryKeyword[] = await this.enrichKeywordsFromDictionary(merged);

    const entity = this.storyRepo.create({
      id: storyId,
      userId,
      title: content.title,
      titleTranslation: content.titleTranslation,
      bodyDe,
      bodyNative,
      nativeLang: settings.uiLanguage,
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
      generationStatus: isPartial ? 'partial' : 'complete',
    });

    const saved = await this.storyRepo.save(entity);
    return this.toModel(saved);
  }

  private async generateQuizQuestions(
    sentences: StorySentence[],
    difficulty: string,
    model: string,
    nativeLanguage = 'English',
  ): Promise<StoryQuizQuestion[]> {
    try {
      const prompt = this.promptBuilder.buildQuizPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildQuizPrompt>[1], nativeLanguage);
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
    nativeLanguage = 'English',
  ): Promise<StoryGrammarNote[]> {
    try {
      const prompt = this.promptBuilder.buildGrammarPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildGrammarPrompt>[1], nativeLanguage);
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
    nativeLanguage = 'English',
  ): Promise<StoryKeyword[]> {
    try {
      const prompt = this.promptBuilder.buildKeywordsPrompt(sentences, difficulty as Parameters<typeof this.promptBuilder.buildKeywordsPrompt>[1], nativeLanguage);
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
    const tier = await this.subscriptions.getEffectiveTier(userId);
    const enrichModel = this.modelForTier(tier);

    const settings = await this.userSettings.getForUser(userId);
    const nativeLangName = LANGUAGE_NAMES[settings.uiLanguage] ?? 'English';

    const [quizQuestions, grammarNotes, aiKeywords] = await Promise.all([
      (entity.quizQuestions ?? []).length === 0
        ? this.generateQuizQuestions(sentences, difficulty, enrichModel, nativeLangName)
        : Promise.resolve(entity.quizQuestions!),
      (entity.grammarNotes ?? []).length === 0
        ? this.generateGrammarNotes(sentences, difficulty, enrichModel, nativeLangName)
        : Promise.resolve(entity.grammarNotes!),
      (entity.keywords ?? []).length === 0
        ? this.generateKeywords(sentences, difficulty, enrichModel, nativeLangName)
        : Promise.resolve(entity.keywords!),
    ]);

    const merged = this.mergeKeywords(aiKeywords, entity.vocabWords ?? []);
    const keywords: StoryKeyword[] = await this.enrichKeywordsFromDictionary(merged);

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
          translation: v.english,
          article: v.article,
          wordType: 'noun',
          level: 'A2',
        });
      }
    }
    const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    return merged.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  }

  private async enrichKeywordsFromDictionary(
    keywords: StoryKeyword[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Promise<StoryKeyword[]> {
    const settled = await Promise.allSettled(
      keywords.map(async kw => {
        // Try DB lookup first (no AI cost). On a miss, resolve() enriches and caches.
        const raw = { back: kw.germanBase, article: (kw.article as 'der' | 'die' | 'das' | null) ?? null };
        let entry = await this.dictionary.lookup(kw.germanBase, kw.article ?? null, targetLang, nativeLang);
        if (!entry) {
          const resolved = await this.dictionary.resolve(raw, targetLang, nativeLang);
          entry = resolved.entry;
        }
        return {
          ...kw,
          translation: entry.translation,
          article: entry.article ?? kw.article,
          wordType: entry.wordType as StoryKeyword['wordType'],
        };
      }),
    );
    return settled.map((r, i) => r.status === 'fulfilled' ? r.value : keywords[i]);
  }

  /**
   * Single-call story generation. Asks the model for the story plus its quiz,
   * grammar notes, and keywords in one JSON payload — cutting four LLM calls down
   * to one. Returns the parsed sections (possibly empty, in which case
   * {@link generateAndSave} falls back to the per-section generators). The
   * 'extra-long' podcast format keeps its dedicated story-only prompt and lets the
   * enrichment sections fall back.
   */
  private async generateStoryWithEnrichment(
    dto: GenerateStoryDto,
    cards: CardEntity[],
    model: string,
    nativeLanguage = 'English',
  ): Promise<{
    content: GeneratedStoryContent;
    quizQuestions: StoryQuizQuestion[];
    grammarNotes: StoryGrammarNote[];
    keywords: StoryKeyword[];
    isPartial: boolean;
  }> {
    if (dto.length === 'extra-long') {
      const { content, isPartial } = await this.generateTextWithModel(dto, cards, model, nativeLanguage);
      return { content, quizQuestions: [], grammarNotes: [], keywords: [], isPartial };
    }

    const prompt = this.promptBuilder.buildCombined(dto, cards, nativeLanguage);

    let rawText: string;
    try {
      const response = await this.openRouter.generateText({
        messages:  [{ role: 'user', content: prompt }],
        maxTokens: 12288,
        model,
      });
      rawText = response.text;
      this.logger.log(`Story (combined) generated | model=${response.model} | ${response.inputTokens}in/${response.outputTokens}out tokens`);
    } catch (err) {
      this.logger.error('AI text generation error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }

    const { content, sentenceCount, wasRecovered } = recoverStoryContent(rawText);

    if (!content || sentenceCount < MIN_RECOVERABLE_SENTENCES) {
      this.logger.error('Story parse failed — recovery found < MIN sentences. Raw response:', rawText);
      throw new InternalServerErrorException('Story generation returned invalid data.');
    }

    const sections = this.parseEnrichmentSections(rawText);

    if (wasRecovered) {
      this.logger.warn(
        `Combined story parse recovered ${sentenceCount} sentences — enrichment sections may fall back.`,
        { sentenceCount },
      );
    }

    return { content, isPartial: wasRecovered, ...sections };
  }

  /**
   * Extracts the quiz/grammar/keywords arrays from a combined-generation payload.
   * Each item is validated and normalized — malformed items are dropped rather than
   * persisted, and a section that ends up empty makes the caller fall back to the
   * per-section generators. Keywords get `cardId: null` (mergeKeywords stamps it later).
   */
  private parseEnrichmentSections(rawText: string): {
    quizQuestions: StoryQuizQuestion[];
    grammarNotes: StoryGrammarNote[];
    keywords: StoryKeyword[];
  } {
    try {
      const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? rawText;
      const cleaned = fenced.trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      const json = first !== -1 && last > first ? cleaned.slice(first, last + 1) : cleaned;
      const parsed = JSON.parse(json) as {
        quizQuestions?: unknown; grammarNotes?: unknown; keywords?: unknown;
      };
      return {
        quizQuestions: this.coerceArray(parsed.quizQuestions, q => this.toQuizQuestion(q)),
        grammarNotes:  this.coerceArray(parsed.grammarNotes,  g => this.toGrammarNote(g)),
        keywords:      this.coerceArray(parsed.keywords,      k => this.toKeyword(k)),
      };
    } catch {
      return { quizQuestions: [], grammarNotes: [], keywords: [] };
    }
  }

  /** Map an unknown array through a validator, dropping items it rejects (null). */
  private coerceArray<T>(value: unknown, map: (item: RawRecord) => T | null): T[] {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const item of value) {
      if (!this.isRecord(item)) continue;
      const mapped = map(item);
      if (mapped !== null) out.push(mapped);
    }
    return out;
  }

  private isRecord(v: unknown): v is RawRecord {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  private isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
  }

  private toQuizQuestion(q: RawRecord): StoryQuizQuestion | null {
    if (!this.isNonEmptyString(q.sentenceTemplate) || !this.isNonEmptyString(q.correctAnswer)) return null;
    const distractors = Array.isArray(q.distractors) ? q.distractors.filter(this.isNonEmptyString) : [];
    if (distractors.length < 2) return null;
    return {
      id: this.isNonEmptyString(q.id) ? q.id : randomUUID(),
      sentenceTemplate: q.sentenceTemplate,
      correctAnswer: q.correctAnswer,
      distractors,
      audioSentence: this.isNonEmptyString(q.audioSentence) ? q.audioSentence : undefined,
      hint: this.isNonEmptyString(q.hint) ? q.hint : undefined,
    };
  }

  private toGrammarNote(g: RawRecord): StoryGrammarNote | null {
    if (!this.isNonEmptyString(g.title) || !this.isNonEmptyString(g.description)) return null;
    const conjugationTable = Array.isArray(g.conjugationTable)
      ? g.conjugationTable.filter((r): r is RawRecord => this.isRecord(r))
          .filter(r => this.isNonEmptyString(r.pronoun) && this.isNonEmptyString(r.form))
          .map(r => ({ pronoun: r.pronoun as string, form: r.form as string }))
      : undefined;
    const additionalExamples = Array.isArray(g.additionalExamples)
      ? g.additionalExamples.filter((r): r is RawRecord => this.isRecord(r))
          .filter(r => this.isNonEmptyString(r.de) && this.isNonEmptyString(r.native))
          .map(r => ({ de: r.de as string, native: r.native as string }))
      : [];
    return {
      id: this.isNonEmptyString(g.id) ? g.id : randomUUID(),
      title: g.title,
      exampleDe: this.isNonEmptyString(g.exampleDe) ? g.exampleDe : '',
      exampleNative: this.isNonEmptyString(g.exampleNative) ? g.exampleNative : '',
      description: g.description,
      conjugationTable,
      additionalExamples,
    };
  }

  private toKeyword(k: RawRecord): StoryKeyword | null {
    if (!this.isNonEmptyString(k.germanBase) || !this.isNonEmptyString(k.translation)) return null;
    const articles: StoryKeyword['article'][] = ['der', 'die', 'das', null];
    const wordTypes: StoryKeyword['wordType'][] = ['noun', 'verb', 'adjective', 'adverb', 'other'];
    const levels: StoryKeyword['level'][] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const article = (articles as unknown[]).includes(k.article) ? k.article as StoryKeyword['article'] : null;
    return {
      cardId: null,
      german: this.isNonEmptyString(k.german) ? k.german : k.germanBase,
      germanBase: k.germanBase,
      translation: k.translation,
      article,
      wordType: wordTypes.includes(k.wordType as StoryKeyword['wordType']) ? k.wordType as StoryKeyword['wordType'] : 'other',
      level: levels.includes(k.level as StoryKeyword['level']) ? k.level as StoryKeyword['level'] : 'A1',
    };
  }

  private async generateTextWithModel(
    dto: GenerateStoryDto,
    cards: CardEntity[],
    model: string,
    nativeLanguage = 'English',
  ): Promise<{ content: GeneratedStoryContent; isPartial: boolean }> {
    const prompt = this.promptBuilder.build(dto, cards, nativeLanguage);

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

    const { content, sentenceCount, wasRecovered } = recoverStoryContent(rawText);

    if (!content || sentenceCount < MIN_RECOVERABLE_SENTENCES) {
      this.logger.error('Story parse failed — recovery found < MIN sentences. Raw response:', rawText);
      throw new InternalServerErrorException('Story generation returned invalid data.');
    }

    if (wasRecovered) {
      this.logger.warn(
        `Story parse failed but recovered ${sentenceCount} sentences — will save as partial.`,
        { sentenceCount },
      );
    }

    return { content, isPartial: wasRecovered };
  }

  async extendStory(entity: StoryEntity): Promise<Story> {
    const tier = await this.subscriptions.getEffectiveTier(entity.userId);
    const model = this.modelForTier(tier);

    const prompt = this.promptBuilder.buildExtensionPrompt(entity);

    let rawText: string;
    try {
      const response = await this.openRouter.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 8192,
        model,
      });
      rawText = response.text;
      this.logger.log(
        `Story extension generated | model=${response.model} | ` +
        `${response.inputTokens}in/${response.outputTokens}out tokens`,
      );
    } catch (err) {
      this.logger.error('Story extension AI error', err);
      throw new InternalServerErrorException('Story extension failed. Please try again.');
    }

    const { content, sentenceCount, wasRecovered } = recoverStoryContent(rawText);

    if (!content || sentenceCount === 0) {
      this.logger.warn('Story extension returned no usable sentences — story remains partial.');
      return this.toModel(entity);
    }

    const existingSentences: StorySentence[] = entity.sentences ?? [];
    const startIndex = existingSentences.length;
    const newSentences: StorySentence[] = content.sentences.map((s, i) => ({
      index: startIndex + i,
      german: s.german,
      native: s.native,
      vocabWordIds: [],
    }));

    entity.sentences = [...existingSentences, ...newSentences];

    // Mark complete only once the story reaches its length target AND this pass
    // wasn't itself truncated. Otherwise keep it 'partial' so it can be extended
    // again. This lets a partial story of ANY length (short → extra-long) be
    // finished across one or more passes, instead of force-completing after a
    // single pass — which previously left longer stories permanently short.
    const target = this.promptBuilder.targetCountForLength(entity.lengthType);
    const isComplete = !wasRecovered && entity.sentences.length >= target;
    entity.generationStatus = isComplete ? 'complete' : 'partial';
    entity.bodyDe = entity.sentences.map(s => s.german).join(' ');
    entity.bodyNative = entity.sentences.map(s => s.native).join(' ');

    const saved = await this.storyRepo.save(entity);

    // Only (re)generate narration once the story is actually finished — avoids a
    // TTS call on every intermediate extension pass (keeps AI/TTS usage minimal).
    if (isComplete) {
      void this.regenerateAudioForExtended(saved);
    }

    return this.toModel(saved);
  }

  private async regenerateAudioForExtended(entity: StoryEntity): Promise<void> {
    try {
      const fullText = entity.sentences.map(s => s.german).join(' ');
      const { audioUrl, timestamps, durationMs } =
        await this.audioService.generateAudioWithTimestamps(fullText, entity.id);

      const markedTimestamps = this.vocabMapper.markVocabWords(
        timestamps,
        entity.vocabWords ?? [],
      );

      entity.audioUrl = audioUrl;
      entity.audioDurationMs = durationMs;
      entity.wordTimestamps = markedTimestamps;

      await this.storyRepo.save(entity);
      this.logger.log(`Audio regenerated for extended story ${entity.id}`);
    } catch (err) {
      this.logger.warn(`Audio regeneration failed for story ${entity.id}`, err);
    }
  }

  private toModel(e: StoryEntity): Story {
    const sentences = normalizeStorySentences(e.sentences);
    return {
      id: e.id,
      userId: e.userId,
      title: e.title,
      titleTranslation: e.titleTranslation,
      bodyDe: e.bodyDe,
      bodyNative: resolveBodyNative(e.bodyNative, sentences),
      nativeLang: e.nativeLang as LanguageCode,
      sentences,
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
      generationStatus: (e.generationStatus ?? 'complete'),
    };
  }
}
