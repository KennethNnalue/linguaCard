import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './providers/anthropic.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import { GeminiAdapter } from './providers/gemini.adapter';

@Module({
  providers: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter],
  exports: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter],
})
export class AiModule {}
