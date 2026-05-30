import { Injectable, inject } from '@angular/core';
import type { PronunciationRequest, WordTimestamp } from '@lingua-card/shared/domain';
import { AnthropicAdapter } from '../providers/anthropic.adapter';
import { OpenAIAdapter } from '../providers/openai.adapter';
import type { AISpeechResponse } from '../providers/ai-provider.interface';
import type { StoryGenerationConfig, GeneratedStoryContent } from '../models/ai-request.model';

@Injectable({ providedIn: 'root' })
export class AiOrchestrationService {
  private readonly anthropic = inject(AnthropicAdapter);
  private readonly openai = inject(OpenAIAdapter);

  async generateStoryText(config: StoryGenerationConfig): Promise<GeneratedStoryContent> {
    const response = await this.anthropic.generateText({
      messages: [{ role: 'user', content: config.prompt }],
      maxTokens: config.maxTokens ?? 2000,
    });

    const json = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(json) as GeneratedStoryContent;
  }

  async generateSpeechWithTimestamps(
    text: string,
    voice?: string,
  ): Promise<{ audioBuffer: ArrayBuffer; timestamps: WordTimestamp[]; durationMs: number }> {
    const speech = await this.openai.generateSpeech({ text, voice });
    const timestamps = await this.openai.transcribeWithTimestamps(speech.audioBuffer);
    return { audioBuffer: speech.audioBuffer, timestamps, durationMs: speech.durationMs };
  }

  async generatePronunciation(request: PronunciationRequest): Promise<AISpeechResponse> {
    return this.openai.generateSpeech({
      text: request.word,
      language: request.language,
      voice: request.voice,
      speed: 0.85,
    });
  }
}
