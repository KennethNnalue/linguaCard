import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type {
  ImageExtractedWord,
  ImageImportRequest,
  ImageImportResult,
} from '@lingua-card/shared/domain';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { ImageImportPromptBuilder } from './image-import-prompt.builder';
import { recoverJsonArray } from './json-recovery.util';

const OPENROUTER_VISION_MODEL = 'google/gemma-4-26b-a4b-it:free';
const GEMINI_FALLBACK_MODEL   = 'gemini-2.5-flash-lite';

@Injectable()
export class ImageImportService {
  private readonly logger = new Logger(ImageImportService.name);

  constructor(
    private readonly openRouter:    OpenRouterAdapter,
    private readonly gemini:        GeminiAdapter,
    private readonly promptBuilder: ImageImportPromptBuilder,
  ) {}

  async extractWords(dto: ImageImportRequest): Promise<ImageImportResult> {
    const startMs    = Date.now();
    const prompt     = this.promptBuilder.build(dto);
    const visionOpts = { imageBase64: dto.imageBase64, mimeType: dto.mimeType, prompt, maxTokens: 4096 };

    let rawText:   string;
    let modelUsed: string;

    try {
      rawText   = await this.openRouter.generateVision(visionOpts);
      modelUsed = OPENROUTER_VISION_MODEL;
    } catch (primaryErr: unknown) {
      // Only fall back on quota / availability errors — re-throw all others
      const status = primaryErr instanceof HttpException
        ? primaryErr.getStatus()
        : (primaryErr as { status?: number })?.status;
      if (status !== 429 && status !== 503) {
        if (primaryErr instanceof HttpException) throw primaryErr;
        this.logger.error('OpenRouter vision call failed', primaryErr);
        throw new InternalServerErrorException('AI processing failed. Please try again.');
      }

      this.logger.warn('OpenRouter vision unavailable — falling back to Gemini Flash-Lite');
      try {
        rawText   = await this.gemini.generateVisionLite(visionOpts);
        modelUsed = GEMINI_FALLBACK_MODEL;
      } catch (fallbackErr: unknown) {
        if (fallbackErr instanceof HttpException) throw fallbackErr;
        this.logger.error('Gemini fallback also failed', fallbackErr);
        throw new InternalServerErrorException('AI processing failed. Please try again.');
      }
    }

    const words = this.parseResponse(rawText);

    if (words.length === 0) {
      throw new BadRequestException('No words detected in image');
    }

    return {
      words,
      totalFound:       words.length,
      imageDescription: '',
      processingMs:     Date.now() - startMs,
      modelUsed,
    };
  }

  private parseResponse(raw: string): ImageExtractedWord[] {
    const items = recoverJsonArray(raw);

    if (items.length === 0) {
      this.logger.error('Vision model returned non-JSON response', raw.slice(0, 200));
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }

    return items.map(item => ({
      front: String(item['front'] ?? ''),
      back: String(item['back'] ?? ''),
      article: this.parseArticle(item['article']),
      plural: null,
      categoryName: String(item['categoryName'] ?? 'Other'),
      exampleTarget: String(item['exampleTarget'] ?? ''),
      exampleNative: String(item['exampleNative'] ?? ''),
      synonyms: [],
      confidence: typeof item['confidence'] === 'number'
        ? Math.min(1, Math.max(0, item['confidence']))
        : 0.5,
    })).filter(w => w.back.length > 0);
  }

  private parseArticle(value: unknown): ImageExtractedWord['article'] {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }
}
