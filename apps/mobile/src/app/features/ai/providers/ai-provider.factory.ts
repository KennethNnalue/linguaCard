import { Injectable, inject } from '@angular/core';
import type { AIProviderType } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';
import type { AIProvider } from './ai-provider.interface';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { GeminiAdapter } from './gemini.adapter';

@Injectable({ providedIn: 'root' })
export class AiProviderFactory {
  private readonly anthropic = inject(AnthropicAdapter);
  private readonly openai = inject(OpenAIAdapter);
  private readonly gemini = inject(GeminiAdapter);

  create(provider: AIProviderType = environment.ai.defaultProvider as AIProviderType): AIProvider {
    switch (provider) {
      case 'anthropic':
        return this.anthropic;
      case 'openai':
        return this.openai;
      case 'gemini':
        return this.gemini;
      default:
        return this.anthropic;
    }
  }
}
