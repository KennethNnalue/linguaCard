import { forwardRef, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../config/ai.config';
import type {
  ArticleType,
  EnrichOneRequest,
  EnrichOneResult,
  EnrichWordsRequest,
  EnrichWordsResult,
  ImageExtractedWord,
  RawExtractedWord,
  RawWordInput,
  Synonym,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { WordEnrichPromptBuilder } from './word-enrich-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';

const DEFAULT_BATCH_SIZE = 10;
const INTER_BATCH_DELAY_MS = 3_500;

export interface RawEnrichResult extends ImageExtractedWord {
  model: string;
}

@Injectable()
export class WordEnrichService {
  private readonly logger = new Logger(WordEnrichService.name);
  private readonly enrichmentModel: string;

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly promptBuilder: WordEnrichPromptBuilder,
    private readonly config:        ConfigService,
    @Inject(forwardRef(() => WordDictionaryService))
    private readonly dictionary: WordDictionaryService,
  ) {
    this.enrichmentModel = this.config.get<AiConfig>('ai')!.enrichmentModel;
    this.logger.log(`Enrichment model: ${this.enrichmentModel}`);
  }

  /**
   * Public entry point for batch enrichment.
   * Checks the dictionary first — only misses reach the AI.
   */
  async enrichWords(dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    const raws: RawWordInput[] = dto.rawWords.map(w => ({
      back: w.back,
      article: w.article as 'der' | 'die' | 'das' | null ?? null,
    }));

    const { entries, reused, enriched: newCount } = await this.dictionary.batchResolve(
      raws,
      dto.targetLanguage,
      dto.nativeLanguage,
    );

    this.logger.log(
      `enrichWords: ${reused} reused from dictionary, ${newCount} newly enriched`,
    );

    const enrichedWords: ImageExtractedWord[] = entries.map(e => ({
      front:         e.translation,
      back:          e.displayText,
      article:       e.article,
      plural:        e.plurals[0] ?? null,
      categoryName:  e.categoryName,
      exampleTarget: e.examples[0]?.target ?? '',
      exampleNative: e.examples[0]?.native ?? '',
      synonyms:      e.synonyms,
      confidence:    1.0,
    }));

    return { enriched: enrichedWords, pending: [], isComplete: true };
  }

  /**
   * Public entry point for single-word enrichment.
   * Checks the dictionary first.
   */
  async enrichOne(dto: EnrichOneRequest): Promise<EnrichOneResult> {
    const raw: RawWordInput = { back: dto.back, article: dto.article ?? null };
    const { entry } = await this.dictionary.resolve(raw, dto.targetLanguage, dto.nativeLanguage);

    return {
      front:         entry.translation,
      back:          entry.displayText,
      article:       entry.article,
      plural:        entry.plurals[0] ?? null,
      categoryName:  entry.categoryName,
      exampleTarget: entry.examples[0]?.target ?? '',
      exampleNative: entry.examples[0]?.native ?? '',
      synonyms:      entry.synonyms,
      confidence:    1.0,
    };
  }

  /**
   * Raw AI enrichment — the ONLY place the model is called.
   * Called exclusively by WordDictionaryService on cache misses.
   */
  async enrichRaw(raw: RawWordInput, targetLanguage: string, nativeLanguage: string): Promise<RawEnrichResult> {
    const extracted: RawExtractedWord = { back: raw.back, article: raw.article, rawText: raw.back };
    const results = await this.enrichBatch([extracted], targetLanguage, nativeLanguage);
    const requestedLower = raw.back.toLowerCase();
    const match = results.find(r => r.back.toLowerCase() === requestedLower) ?? results[0];
    return {
      ...(match ?? {
        front: '', back: raw.back, article: null, plural: null,
        categoryName: 'Other', exampleTarget: '', exampleNative: '',
        synonyms: [], confidence: 1.0,
      }),
      model: this.enrichmentModel,
    };
  }

  private async enrichBatch(
    words: RawExtractedWord[],
    targetLanguage: string,
    nativeLanguage: string,
  ): Promise<ImageExtractedWord[]> {
    const prompt = this.promptBuilder.build(words, targetLanguage, nativeLanguage);
    const result = await this.openRouter.generateText({
      messages:  [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      model:     this.enrichmentModel,
    });
    return this.parseEnrichmentResponse(result.text);
  }

  private parseEnrichmentResponse(raw: string): ImageExtractedWord[] {
    const items = recoverJsonArray(raw);
    return items
      .map(item => {
        const article = this.parseArticle(item['article']);
        return {
          front:         String(item['front']         ?? ''),
          back:          String(item['back']          ?? ''),
          article,
          plural:        this.parsePlural(item['plural'], article),
          categoryName:  String(item['categoryName']  ?? 'Other'),
          exampleTarget: String(item['exampleTarget'] ?? ''),
          exampleNative: String(item['exampleNative'] ?? ''),
          synonyms:      this.parseSynonyms(item['synonyms'], String(item['back'] ?? '')),
          confidence:    typeof item['confidence'] === 'number' ? item['confidence'] : 1.0,
        };
      })
      .filter(w => w.back.length > 0);
  }

  private parseArticle(value: unknown): ArticleType | null {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }

  private parsePlural(value: unknown, article: ArticleType | null): string | null {
    if (!article) return null;
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > 0 ? s : null;
  }

  private parseSynonyms(value: unknown, headword: string): Synonym[] {
    if (!Array.isArray(value)) return [];
    const headLower = headword.toLowerCase().replace(/^(der|die|das)\s+/, '');
    const seen = new Set<string>();
    return value
      .map(s => ({
        word:          String(s?.['word']          ?? '').trim(),
        article:       this.parseArticle(s?.['article']),
        translation:   String(s?.['translation']   ?? '').trim(),
        example:       String(s?.['example']       ?? '').trim(),
        exampleNative: String(s?.['exampleNative'] ?? '').trim(),
      }))
      .filter(s => {
        const key = s.word.toLowerCase();
        if (!s.word.length || key === headLower || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
