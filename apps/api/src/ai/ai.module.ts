import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './providers/anthropic.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import { GeminiAdapter } from './providers/gemini.adapter';
import { AiController } from './ai.controller';
import { StorageService } from '../storage/storage.service';

@Module({
  controllers: [AiController],
  providers: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, StorageService],
  exports: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter],
})
export class AiModule {}
