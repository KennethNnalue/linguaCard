import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { GoogleCloudTTSAdapter } from '../ai/providers/google-cloud-tts.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { GroqWhisperAdapter } from '../ai/providers/groq-whisper.adapter';
import { StorageService } from '../storage/storage.service';
import { buildStorySsml } from '../word-audio/ssml-builder';

@Injectable()
export class StoryAudioService {
  private readonly logger = new Logger(StoryAudioService.name);

  constructor(
    private readonly tts:         GoogleCloudTTSAdapter,
    private readonly gemini:      GeminiAdapter,
    private readonly groqWhisper: GroqWhisperAdapter,
    private readonly storage:     StorageService,
  ) {}

  private async generateSpeechWithFallback(
    text:     string,
    language: string,
    ssml:     boolean,
  ): Promise<{ audioBuffer: ArrayBuffer; durationMs: number; mimeType: string }> {
    try {
      const speech = await this.tts.generateSpeech({ text, language, ssml });
      return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: 'audio/mpeg' };
    } catch (primaryErr: unknown) {
      const code = (primaryErr as any)?.code;
      const isRecoverable =
        code === 8 ||   // RESOURCE_EXHAUSTED (quota)
        code === 14 ||  // UNAVAILABLE
        (primaryErr as any) instanceof ServiceUnavailableException;

      if (!isRecoverable) throw primaryErr;

      this.logger.warn('Google Cloud TTS unavailable — falling back to Gemini TTS');
    }

    const speech = await this.gemini.generateSpeech({ text, language });
    return { audioBuffer: speech.audioBuffer, durationMs: speech.durationMs, mimeType: speech.mimeType };
  }

  async generateAudioWithTimestamps(
    storyText: string,
    storyId:   string,
  ): Promise<{ audioUrl: string | null; timestamps: WordTimestamp[]; durationMs: number }> {
    let audioBuffer: ArrayBuffer;
    let durationMs:  number;
    let mimeType:    string;

    try {
      const speech = await this.generateSpeechWithFallback(buildStorySsml(storyText), 'de-DE', true);
      audioBuffer  = speech.audioBuffer;
      durationMs   = speech.durationMs;
      mimeType     = speech.mimeType;
    } catch (err) {
      this.logger.error(`TTS failed for story ${storyId}`, err);
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
