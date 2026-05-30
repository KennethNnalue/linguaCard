import { Injectable, inject, Injector } from '@angular/core';
import type { PronunciationRequest, WordTimestamp } from '@lingua-card/shared/domain';
import { AnthropicAdapter } from '../providers/anthropic.adapter';
import { GeminiAdapter } from '../providers/gemini.adapter';
import type { AISpeechResponse } from '../providers/ai-provider.interface';
import type { StoryGenerationConfig, GeneratedStoryContent } from '../models/ai-request.model';

@Injectable({ providedIn: 'root' })
export class AiOrchestrationService {
  private readonly anthropic = inject(AnthropicAdapter);
  private readonly gemini = inject(GeminiAdapter);
  private readonly injector = inject(Injector);

  async generateStoryText(config: StoryGenerationConfig): Promise<GeneratedStoryContent> {
    const response = await this.anthropic.generateText({
      messages: [{ role: 'user', content: config.prompt }],
      maxTokens: config.maxTokens ?? 2000,
    });

    const json = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(json) as GeneratedStoryContent;
  }

  // Gemini generates audio. Whisper (OpenAI) provides word-level timestamps
  // when an OPENAI_API_KEY is configured; otherwise timestamps are empty.
  async generateSpeechWithTimestamps(
    text: string,
    voice?: string,
  ): Promise<{ audioBuffer: ArrayBuffer; timestamps: WordTimestamp[]; durationMs: number }> {
    const speech = await this.gemini.generateSpeech({ text, voice, language: 'de-DE' });

    let timestamps: WordTimestamp[] = [];
    try {
      const { OpenAIAdapter } = await import('../providers/openai.adapter');
      const openai = this.injector.get(OpenAIAdapter);
      timestamps = await openai.transcribeWithTimestamps(speech.audioBuffer);
    } catch {
      // OpenAI key not configured — karaoke timestamps unavailable
    }

    return { audioBuffer: speech.audioBuffer, timestamps, durationMs: speech.durationMs };
  }

  async generatePronunciation(request: PronunciationRequest): Promise<AISpeechResponse> {
    return this.gemini.generateSpeech({
      text: request.word,
      language: request.language,
      voice: request.voice,
    });
  }
}
