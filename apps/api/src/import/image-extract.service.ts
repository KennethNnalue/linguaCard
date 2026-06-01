import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type {
  ArticleType,
  ImageImportRequest,
  RawExtractedWord,
  WordExtractionResult,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { ImageExtractPromptBuilder } from './image-extract-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';

const OPENROUTER_VISION_MODEL = 'google/gemma-4-26b-a4b-it:free';
const GEMINI_FALLBACK_MODEL   = 'gemini-2.5-flash-lite';

@Injectable()
export class ImageExtractService {
  private readonly logger = new Logger(ImageExtractService.name);

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly gemini:        GeminiAdapter,
    private readonly promptBuilder: ImageExtractPromptBuilder,
  ) {}

  async extractRawWords(dto: ImageImportRequest): Promise<WordExtractionResult> {
    const startMs    = Date.now();
    const prompt     = this.promptBuilder.build(dto);
    const visionOpts = {
      imageBase64: dto.imageBase64,
      mimeType:    dto.mimeType,
      prompt,
      maxTokens:   2048,
    };

    let rawText:   string;
    let modelUsed: string;

    try {
      rawText   = await this.openRouter.generateVision(visionOpts);
      modelUsed = OPENROUTER_VISION_MODEL;
    } catch (primaryErr: unknown) {
      const status = primaryErr instanceof HttpException
        ? primaryErr.getStatus()
        : (primaryErr as { status?: number })?.status;

      if (status !== 429 && status !== 503) {
        if (primaryErr instanceof HttpException) throw primaryErr;
        this.logger.error('OpenRouter vision call failed (Phase 1)', primaryErr);
        throw new InternalServerErrorException('AI processing failed. Please try again.');
      }

      this.logger.warn('OpenRouter Phase 1 unavailable — falling back to Gemini Flash-Lite');
      try {
        rawText   = await this.gemini.generateVisionLite(visionOpts);
        modelUsed = GEMINI_FALLBACK_MODEL;
      } catch (fallbackErr: unknown) {
        if (fallbackErr instanceof HttpException) throw fallbackErr;
        this.logger.error('Gemini fallback (Phase 1) also failed', fallbackErr);
        throw new InternalServerErrorException('AI processing failed. Please try again.');
      }
    }

    const rawWords = this.parseRawWords(rawText);

    if (rawWords.length === 0) {
      throw new BadRequestException('No words detected in image');
    }

    return {
      rawWords,
      totalFound:       rawWords.length,
      imageDescription: '',
      processingMs:     Date.now() - startMs,
      modelUsed,
    };
  }

  private parseRawWords(raw: string): RawExtractedWord[] {
    const items = recoverJsonArray(raw);
    return items
      .map(item => ({
        back:    String(item['back'] ?? ''),
        article: this.parseArticle(item['article']),
        rawText: String(item['back'] ?? ''),
      }))
      .filter(w => w.back.length > 0);
  }

  private parseArticle(value: unknown): ArticleType | null {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }
}
