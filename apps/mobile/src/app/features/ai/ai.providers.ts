import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AnthropicAdapter } from './providers/anthropic.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { AiOrchestrationService } from './orchestration/ai-orchestration.service';

export function provideAi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    AnthropicAdapter,
    OpenAIAdapter,
    AiProviderFactory,
    AiOrchestrationService,
  ]);
}
