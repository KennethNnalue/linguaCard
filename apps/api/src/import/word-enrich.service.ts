import { HttpException, Injectable, Logger } from '@nestjs/common';
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
  Synonym,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { WordEnrichPromptBuilder } from './word-enrich-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';

const DEFAULT_BATCH_SIZE = 10;
// 20 RPM free tier = 1 req per 3s. 3 500ms gives headroom for the request itself taking ~0.5–1s.
const INTER_BATCH_DELAY_MS = 3_500;

@Injectable()
export class WordEnrichService {
  private readonly logger = new Logger(WordEnrichService.name);
  private readonly enrichmentModel: string;

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly promptBuilder: WordEnrichPromptBuilder,
    private readonly config:        ConfigService,
  ) {
    this.enrichmentModel = this.config.get<AiConfig>('ai')!.enrichmentModel;
    this.logger.log(`Enrichment model: ${this.enrichmentModel}`);
  }

  async enrichWords(dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    const batchSize = dto.batchSize ?? DEFAULT_BATCH_SIZE;
    const batches   = this.chunk(dto.rawWords, batchSize);

    const enriched: ImageExtractedWord[] = [];
    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      if (i > 0) await this.sleep(INTER_BATCH_DELAY_MS);
      const batch = batches[i];
      try {
        const batchResult = await this.enrichBatch(batch, dto.targetLanguage, dto.nativeLanguage);
        enriched.push(...batchResult);
        processedCount += batch.length;
      } catch (err: unknown) {
        const status = err instanceof HttpException
          ? err.getStatus()
          : (err as { status?: number })?.status;

        if (status === 429 || status === 503) {
          this.logger.warn(
            `Enrichment rate-limited after batch ${i} — ${enriched.length} words enriched, ` +
            `${dto.rawWords.length - processedCount} pending`,
          );
          break;
        }

        // Non-rate-limit error — log and skip this batch, continue with the next
        this.logger.error(`Batch ${i} enrichment failed (non-rate-limit)`, err);
        processedCount += batch.length;
      }
    }

    const pending = dto.rawWords.slice(processedCount);

    return {
      enriched,
      pending,
      isComplete: pending.length === 0,
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
    const rawText = result.text;

    return this.parseEnrichmentResponse(rawText);
  }

  async enrichOne(dto: EnrichOneRequest): Promise<EnrichOneResult> {
    const raw: RawExtractedWord = { back: dto.back, article: null, rawText: dto.back };
    const results = await this.enrichBatch([raw], dto.targetLanguage, dto.nativeLanguage);
    // Prefer the result whose back matches the requested word — the LLM
    // occasionally returns extra items before the one we asked for.
    const requestedLower = dto.back.toLowerCase();
    const match = results.find(r => r.back.toLowerCase() === requestedLower) ?? results[0];
    return match ?? {
      front: '', back: dto.back, article: null, plural: null,
      categoryName: 'Other', exampleTarget: '', exampleNative: '',
      synonyms: [], confidence: 1.0,
    };
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

  /** plural is only meaningful for nouns (article present). Nullify for non-nouns. */
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

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
