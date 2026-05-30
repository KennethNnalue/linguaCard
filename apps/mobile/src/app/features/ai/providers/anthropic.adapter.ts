import { Injectable } from '@angular/core';
import Anthropic from '@anthropic-ai/sdk';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import type {
  AIProvider,
  AITextRequest,
  AITextResponse,
  AISpeechRequest,
  AISpeechResponse,
} from './ai-provider.interface';

@Injectable({ providedIn: 'root' })
export class AnthropicAdapter implements AIProvider {
  readonly name = 'anthropic' as const;
  private client: Anthropic;

  constructor() {
    // API key is empty on the Angular side — all AI calls are proxied through NestJS.
    // This adapter is registered in DI but generateText() is only called server-side.
    this.client = new Anthropic({ apiKey: '', dangerouslyAllowBrowser: true });
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
      provider: 'anthropic',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  generateSpeech(_request: AISpeechRequest): Promise<AISpeechResponse> {
    throw new Error('AnthropicAdapter does not support speech generation. Use OpenAIAdapter.');
  }

  transcribeWithTimestamps(_audioBuffer: ArrayBuffer): Promise<WordTimestamp[]> {
    throw new Error('AnthropicAdapter does not support transcription. Use OpenAIAdapter.');
  }
}
