import { forwardRef, Module } from '@nestjs/common';
import { AnthropicAdapter } from './providers/anthropic.adapter';
import { OpenAIAdapter } from './providers/openai.adapter';
import { GeminiAdapter } from './providers/gemini.adapter';
import { OpenRouterAdapter } from './providers/openrouter.adapter';
import { GroqWhisperAdapter } from './providers/groq-whisper.adapter';
import { GoogleCloudTTSAdapter } from './providers/google-cloud-tts.adapter';
import { AiController } from './ai.controller';
import { StorageService } from '../storage/storage.service';
import { WordAudioModule } from '../word-audio/word-audio.module';

@Module({
  imports: [forwardRef(() => WordAudioModule)],
  controllers: [AiController],
  providers: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, OpenRouterAdapter, GroqWhisperAdapter, GoogleCloudTTSAdapter, StorageService],
  exports: [AnthropicAdapter, OpenAIAdapter, GeminiAdapter, OpenRouterAdapter, GroqWhisperAdapter, GoogleCloudTTSAdapter, StorageService],
})
export class AiModule {}
