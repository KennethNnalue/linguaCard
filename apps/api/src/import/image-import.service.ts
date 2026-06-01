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
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { ImageImportPromptBuilder } from './image-import-prompt.builder';

const VISION_MODEL = 'gemini-2.5-flash';

@Injectable()
export class ImageImportService {
  private readonly logger = new Logger(ImageImportService.name);

  constructor(
    private readonly gemini: GeminiAdapter,
    private readonly promptBuilder: ImageImportPromptBuilder,
  ) {}

  async extractWords(dto: ImageImportRequest): Promise<ImageImportResult> {
    const startMs = Date.now();
    const prompt = this.promptBuilder.build(dto);

    let rawText: string;
    try {
      rawText = await this.gemini.generateVision({
        imageBase64: dto.imageBase64,
        mimeType: dto.mimeType,
        prompt,
        maxTokens: 4096,
      });
    } catch (err: unknown) {
      // Re-throw HttpExceptions (e.g. 429) directly — don't swallow them as 500
      if (err instanceof HttpException) throw err;
      this.logger.error('Gemini vision call failed', err);
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }

    const words = this.parseResponse(rawText);

    if (words.length === 0) {
      throw new BadRequestException('No words detected in image');
    }

    return {
      words,
      totalFound: words.length,
      imageDescription: '',
      processingMs: Date.now() - startMs,
      modelUsed: VISION_MODEL,
    };
  }

  private parseResponse(raw: string): ImageExtractedWord[] {
    // Strip any accidental markdown fences Gemini may add
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('Gemini returned non-JSON response', raw);
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }

    if (!Array.isArray(parsed)) {
      this.logger.error('Gemini response was not an array', raw);
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }

    return (parsed as Record<string, unknown>[]).map(item => ({
      front: String(item['front'] ?? ''),
      back: String(item['back'] ?? ''),
      article: this.parseArticle(item['article']),
      categoryName: String(item['categoryName'] ?? 'Other'),
      exampleTarget: String(item['exampleTarget'] ?? ''),
      exampleNative: String(item['exampleNative'] ?? ''),
      confidence: typeof item['confidence'] === 'number'
        ? Math.min(1, Math.max(0, item['confidence']))
        : 0.5,
    }));
  }

  private parseArticle(value: unknown): ImageExtractedWord['article'] {
    if (value === 'der' || value === 'die' || value === 'das') return value;
    return null;
  }
}
