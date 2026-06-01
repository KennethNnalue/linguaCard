import { Injectable, Logger } from '@nestjs/common';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { GroqWhisperAdapter } from '../ai/providers/groq-whisper.adapter';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StoryAudioService {
  private readonly logger = new Logger(StoryAudioService.name);

  constructor(
    private readonly gemini:      GeminiAdapter,
    private readonly groqWhisper: GroqWhisperAdapter,
    private readonly storage:     StorageService,
  ) {}

  async generateAudioWithTimestamps(
    storyText: string,
    storyId:   string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    let audioBuffer: ArrayBuffer;
    let durationMs:  number;
    let mimeType:    string;

    try {
      const speech = await this.gemini.generateSpeech({ text: storyText, language: 'de-DE' });
      audioBuffer  = speech.audioBuffer;
      durationMs   = speech.durationMs;
      mimeType     = speech.mimeType;
    } catch (err) {
      this.logger.error(`Gemini TTS failed for story ${storyId}`, err);
      return { audioUrl: null, timestamps: [], durationMs: 0 };
    }

    const ext         = mimeType.includes('mp3') ? 'mp3' : 'wav';
    const contentType = mimeType.includes('mp3') ? 'audio/mpeg' : 'audio/wav';

    const audioUrl = await this.storage.upload(
      Buffer.from(audioBuffer),
      `stories/${storyId}.${ext}`,
      contentType,
    );

    // Word-level timestamps via Groq Whisper (free tier, replaces paid OpenAI Whisper)
    let timestamps: WordTimestamp[];
    try {
      timestamps = await this.groqWhisper.transcribeWithTimestamps(audioBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Groq Whisper failed for story ${storyId}`, err);
      timestamps = [];
    }

    return { audioUrl, timestamps, durationMs };
  }
}
