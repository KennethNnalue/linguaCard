import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/ai.config';
import type { AITextRequest, AITextResponse } from './anthropic.adapter';

// Extends AITextRequest with optional per-call model and temperature overrides.
interface OpenRouterTextRequest extends AITextRequest {
  model?:       string;
  temperature?: number;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const APP_REFERER     = 'https://linguacard.app';
const APP_TITLE       = 'LinguaCard';

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 1000;

@Injectable()
export class OpenRouterAdapter {
  private readonly logger       = new Logger(OpenRouterAdapter.name);
  private readonly apiKey:      string;
  private readonly visionModel: string;
  private readonly textModel:   string;

  constructor(private readonly config: ConfigService) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.apiKey       = ai.openrouterApiKey;
    this.visionModel  = ai.openrouterVisionModel;
    this.textModel    = ai.openrouterTextModel;
    if (!this.apiKey) this.logger.warn('OPENROUTER_API_KEY not set — vision calls will fail with 401');
  }

  async generateVision(opts: {
    imageBase64: string;
    mimeType:    string;
    prompt:      string;
    maxTokens?:  number;
  }): Promise<string> {
    const body = {
      model:      this.visionModel,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${opts.mimeType};base64,${opts.imageBase64}` },
            },
            { type: 'text', text: opts.prompt },
          ],
        },
      ],
    };

    const raw = await this.callWithRetry('/chat/completions', body);
    return (raw?.choices?.[0]?.message?.content as string | undefined) ?? '';
  }

  async generateText(request: OpenRouterTextRequest): Promise<AITextResponse> {
    const modelToUse = request.model ?? this.textModel;

    const body = {
      model:       modelToUse,
      max_tokens:  request.maxTokens  ?? 4096,
      temperature: request.temperature ?? 0.7,
      messages:    request.messages,
    };

    const raw   = await this.callWithRetry('/chat/completions', body);
    const text  = (raw?.choices?.[0]?.message?.content as string | undefined) ?? '';
    const usage = (raw?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined) ?? {};

    return {
      text,
      model:        (raw?.model as string | undefined) ?? modelToUse,
      inputTokens:  usage.prompt_tokens    ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async callWithRetry(path: string, body: unknown, attempt = 0): Promise<any> {
    const url = `${OPENROUTER_BASE}${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  APP_REFERER,
          'X-Title':       APP_TITLE,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      this.logger.error('OpenRouter network error', networkErr);
      throw new HttpException('AI service unreachable', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) {
        this.logger.warn(`OpenRouter 429 — max retries (${MAX_RETRIES}) reached`);
        throw new HttpException(
          { message: 'AI quota exceeded. Please try again later.', retryAfterMs: 60_000 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const retryAfter = res.headers.get('Retry-After');
      const delayMs    = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);

      this.logger.warn(`OpenRouter 429 — retrying in ${delayMs}ms (attempt ${attempt + 1})`);
      await this.sleep(delayMs);
      return this.callWithRetry(path, body, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenRouter HTTP ${res.status}`, text);
      throw new HttpException('AI processing failed. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
