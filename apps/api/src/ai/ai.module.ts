import { forwardRef, Module } from '@nestjs/common';
import { AnthropicAdapter } from './providers/anthropic.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import { GeminiAdapter } from './providers/gemini.adapter';
import { AiController } from './ai.controller';
import { StorageService } from '../storage/storage.service';
import { WordAudioModule } from '../word-audio/word-audio.module';

@Module({
  imports: [forwardRef(() => WordAudioModule)],
  controllers: [AiController],
  providers: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, StorageService],
  exports: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, StorageService],
})
export class AiModule {}
