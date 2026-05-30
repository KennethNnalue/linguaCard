import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../../config/ai.config';

export interface AITextRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}

export interface AITextResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class AnthropicAdapter {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicAdapter.name);

  constructor(private readonly config: ConfigService) {
    const key = config.get<AiConfig>('ai')!.anthropicApiKey;
    this.client = new Anthropic({ apiKey: key || 'not-configured' });
  }

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: request.maxTokens ?? 2000,
      messages: request.messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    return {
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
