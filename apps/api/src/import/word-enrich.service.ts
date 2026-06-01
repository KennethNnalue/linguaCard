import { HttpException, Injectable, Logger } from '@nestjs/common';
import type {
  ArticleType,
  EnrichWordsRequest,
  EnrichWordsResult,
  ImageExtractedWord,
  RawExtractedWord,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { WordEnrichPromptBuilder } from './word-enrich-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';

const DEFAULT_BATCH_SIZE = 10;

@Injectable()
export class WordEnrichService {
  private readonly logger = new Logger(WordEnrichService.name);

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly promptBuilder: WordEnrichPromptBuilder,
  ) {}

  async enrichWords(dto: EnrichWordsRequest): Promise<EnrichWordsResult> {
    const batchSize = dto.batchSize ?? DEFAULT_BATCH_SIZE;
    const batches   = this.chunk(dto.rawWords, batchSize);

    const enriched: ImageExtractedWord[] = [];
    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
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
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
    });
    return this.parseEnrichmentResponse(result.text);
  }

  private parseEnrichmentResponse(raw: string): ImageExtractedWord[] {
    const items = recoverJsonArray(raw);
    return items
      .map(item => ({
        front:         String(item['front']         ?? ''),
        back:          String(item['back']          ?? ''),
        article:       this.parseArticle(item['article']),
        categoryName:  String(item['categoryName']  ?? 'Other'),
        exampleTarget: String(item['exampleTarget'] ?? ''),
        exampleNative: String(item['exampleNative'] ?? ''),
        confidence:    typeof item['confidence'] === 'number' ? item['confidence'] : 1.0,
      }))
      .filter(w => w.back.length > 0);
  }

  private parseArticle(value: unknown): ArticleType | null {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
