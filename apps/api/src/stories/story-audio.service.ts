import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { GoogleCloudTTSAdapter } from '../ai/providers/google-cloud-tts.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { GroqWhisperAdapter } from '../ai/providers/groq-whisper.adapter';
import { StorageService } from '../storage/storage.service';
import { buildStorySsml } from '../word-audio/ssml-builder';
import { audioContentTypeFor, audioExtFor } from '../common/audio/audio-format';

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
      const err = primaryErr as any;

      if (err instanceof ServiceUnavailableException) {
        this.logger.error(
          'Google Cloud TTS is not configured (GOOGLE_CLOUD_TTS_KEY_BASE64 missing or invalid). ' +
          'Fix the environment variable — not falling back to Gemini for config errors.',
          err,
        );
        throw err;
      }

      const transientGrpcCodes = new Set([4, 8, 14]);
      const isTransient = transientGrpcCodes.has(err?.code);

      if (!isTransient) {
        this.logger.error(
          `Google Cloud TTS failed with non-transient error (code=${err?.code}): ${err?.message}`,
          err,
        );
        throw primaryErr;
      }

      this.logger.warn(
        `Google Cloud TTS transient error (gRPC code=${err?.code}) — falling back to Gemini TTS`,
      );
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

    const ext         = audioExtFor(mimeType);
    const contentType = audioContentTypeFor(mimeType);

    const audioUrl = await this.storage.upload(
      Buffer.from(audioBuffer),
      `stories/${storyId}.${ext}`,
      contentType,
    );

    // Word-level timestamps via Groq Whisper (free tier, replaces paid OpenAI Whisper).
    // DORMANT: GROQ_API_KEY is currently unset in production, so this returns [] and
    // stories ship with no word timestamps. Karaoke runs at SENTENCE granularity on
    // the client (estimated from audioDurationMs) and does not depend on this. When
    // Whisper is enabled later, the client refines sentence boundaries automatically.
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
