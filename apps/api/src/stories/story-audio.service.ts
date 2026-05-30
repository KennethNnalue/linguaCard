import { Injectable, Logger } from '@nestjs/common';
import type { Story, WordTimestamp } from '@lingua-card/shared/domain';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { OpenAIAdapter } from '../ai/providers/openai.adapter';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StoryAudioService {
  private readonly logger = new Logger(StoryAudioService.name);

  constructor(
    private readonly gemini: GeminiAdapter,
    private readonly openai: OpenAIAdapter,
    private readonly storage: StorageService,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId: string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    let audioBuffer: ArrayBuffer;
    let durationMs: number;
    let mimeType: string;

    try {
      const speech = await this.gemini.generateSpeech({ text: storyText, language: 'de-DE' });
      audioBuffer = speech.audioBuffer;
      durationMs = speech.durationMs;
      mimeType = speech.mimeType;
    } catch (err) {
      this.logger.error(`Gemini TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    // Determine file extension from mime type (pcm → wav, otherwise wav)
    const ext = mimeType.includes('mp3') ? 'mp3' : 'wav';
    const contentType = mimeType.includes('mp3') ? 'audio/mpeg' : 'audio/wav';

    const audioUrl = await this.storage.upload(
      Buffer.from(audioBuffer),
      `stories/${storyId}.${ext}`,
      contentType,
    );

    // Whisper transcription for word-level timestamps (handles wav and pcm)
    let timestamps: WordTimestamp[];
    try {
      timestamps = await this.openai.transcribeWithTimestamps(audioBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Whisper failed for story ${storyId}`, err);
      return { audioUrl, timestamps: [], durationMs };
    }

    return { audioUrl, timestamps, durationMs };
  }
}
