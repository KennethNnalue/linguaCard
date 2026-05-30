import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import type { AiConfig } from '../../config/ai.config';

export interface AISpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export interface AISpeechResponse {
  audioBuffer: ArrayBuffer;
  durationMs: number;
}

@Injectable()
export class OpenAIAdapter {
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAIAdapter.name);

  constructor(private readonly config: ConfigService) {
    const key = config.get<AiConfig>('ai')!.openaiApiKey;
    // dangerouslyAllowBrowser + placeholder key lets the SDK initialise
    // without throwing — actual calls will fail fast with a clear 401 if
    // the key is missing, rather than crashing the whole app on startup.
    this.client = new OpenAI({ apiKey: key || 'not-configured' });
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
}
