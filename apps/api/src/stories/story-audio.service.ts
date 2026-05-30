import { Injectable, Logger } from '@nestjs/common';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { OpenAIAdapter } from '../ai/providers/openai.adapter';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StoryAudioService {
  private readonly logger = new Logger(StoryAudioService.name);

  constructor(
    private readonly openai: OpenAIAdapter,
    private readonly storage: StorageService,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId: string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    let audioBuffer: ArrayBuffer;
    let durationMs: number;

    try {
      const speech = await this.openai.generateSpeech({ text: storyText, speed: 0.9 });
      audioBuffer = speech.audioBuffer;
      durationMs = speech.durationMs;
    } catch (err) {
      this.logger.error(`TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    const audioUrl = await this.storage.upload(
      Buffer.from(audioBuffer),
      `stories/${storyId}.mp3`,
      'audio/mpeg',
    );

    let timestamps: WordTimestamp[];
    try {
      timestamps = await this.openai.transcribeWithTimestamps(audioBuffer);
    } catch (err) {
      this.logger.error(`Whisper failed for story ${storyId}`, err);
      return { audioUrl, timestamps: [], durationMs };
    }

    return { audioUrl, timestamps, durationMs };
  }
}
