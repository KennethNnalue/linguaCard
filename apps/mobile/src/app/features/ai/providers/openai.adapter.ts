import { Injectable } from '@angular/core';
import OpenAI from 'openai';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import type {
  AIProvider,
  AITextRequest,
  AITextResponse,
  AISpeechRequest,
  AISpeechResponse,
} from './ai-provider.interface';

@Injectable({ providedIn: 'root' })
export class OpenAIAdapter implements AIProvider {
  readonly name = 'openai' as const;
  // Client is null when no API key is configured — methods fail fast with a
  // clear message rather than crashing the entire DI graph at construction.
  private client: OpenAI;

  constructor() {
    // All real OpenAI calls (Whisper transcription) go through the NestJS backend.
    // The Angular-side client is never used in production — only instantiated when
    // an explicit key is injected via the environment (e.g. for local testing).
    // Using a placeholder prevents the SDK from throwing at construction time.
    this.client = new OpenAI({ apiKey: 'not-configured', dangerouslyAllowBrowser: true });
  }

  async generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse> {
    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: (request.voice as 'onyx') ?? 'onyx',
      input: request.text,
      response_format: 'mp3',
      speed: request.speed ?? 0.9,
    });
    const audioBuffer = await response.arrayBuffer();
    const durationMs = Math.round((audioBuffer.byteLength / 16000) * 1000);
    return { audioBuffer, durationMs };
  }

  async transcribeWithTimestamps(audioBuffer: ArrayBuffer): Promise<WordTimestamp[]> {
    const file = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
    const transcription = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    return ((transcription as any).words ?? []).map((w: any) => ({
      word: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      isVocab: false,
      cardId: undefined,
    }));
  }

  generateText(_request: AITextRequest): Promise<AITextResponse> {
    throw new Error('OpenAIAdapter does not support text generation. Use AnthropicAdapter.');
  }
}
