import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import type { AiConfig } from '../../config/ai.config';
import { getMp3DurationMs } from '../../common/audio/mp3-duration';

export interface TTSSpeechRequest {
  text:      string;
  voice?:    string;
  language?: string;
  ssml?:     boolean;
  speed?:    number;
}

export interface TTSSpeechResponse {
  audioBuffer:    ArrayBuffer;
  durationMs:     number;
  mimeType:       'audio/mpeg';
  characterCount: number;
}

@Injectable()
export class GoogleCloudTTSAdapter implements OnModuleInit {
  private readonly logger  = new Logger(GoogleCloudTTSAdapter.name);
  private client!: TextToSpeechClient;
  private readonly defaultVoice:    string;
  private readonly defaultLanguage: string;
  private isConfigured = false;

  constructor(private readonly config: ConfigService) {
    const ai = this.config.get<AiConfig>('ai')!;
    this.defaultVoice    = ai.googleCloudTtsVoice    || 'de-DE-Wavenet-B';
    this.defaultLanguage = ai.googleCloudTtsLanguage || 'de-DE';
  }

  onModuleInit(): void {
    const ai = this.config.get<AiConfig>('ai')!;
    const keyBase64 = ai.googleCloudTtsKeyBase64;

    if (!keyBase64) {
      this.logger.warn(
        'GOOGLE_CLOUD_TTS_KEY_BASE64 is not set. ' +
        'GoogleCloudTTSAdapter will not generate audio. ' +
        'Set up the service account and add the key to resolve this.',
      );
      return;
    }

    // Gemini-family voice names inside Cloud TTS API have NO free tier — billed
    // from character 0. Refuse to configure rather than generate surprise bills.
    if (this.defaultVoice.toLowerCase().includes('gemini')) {
      this.logger.error(
        `GOOGLE_CLOUD_TTS_VOICE is set to "${this.defaultVoice}" which is a Gemini-family ` +
        `voice. Gemini voices inside Cloud TTS API have no free tier and are billed from ` +
        `character 0. Set GOOGLE_CLOUD_TTS_VOICE=de-DE-Wavenet-B instead.`,
      );
      return;  // isConfigured stays false — no audio generated, no surprise bills
    }

    try {
      const keyJson     = Buffer.from(keyBase64, 'base64').toString('utf-8');
      const credentials = JSON.parse(keyJson);
      this.client       = new TextToSpeechClient({ credentials });
      this.isConfigured = true;
      this.logger.log(
        `GoogleCloudTTSAdapter initialised. ` +
        `Voice: ${this.defaultVoice} | Language: ${this.defaultLanguage}`,
      );
    } catch (err) {
      this.logger.error(
        'Failed to parse GOOGLE_CLOUD_TTS_KEY_BASE64 — is the value valid base64-encoded JSON?',
        err,
      );
    }
  }

  async generateSpeech(request: TTSSpeechRequest): Promise<TTSSpeechResponse> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Google Cloud TTS is not configured. ' +
        'Add GOOGLE_CLOUD_TTS_KEY_BASE64 to your environment.',
      );
    }

    const voiceName    = request.voice    ?? this.defaultVoice;
    const languageCode = request.language ?? this.defaultLanguage;
    const speakingRate = request.speed    ?? 1.0;

    const input: protos.google.cloud.texttospeech.v1.ISynthesisInput = request.ssml
      ? { ssml: request.text }
      : { text: request.text };

    const characterCount = request.text.length;

    let response: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse;
    try {
      [response] = await this.client.synthesizeSpeech({
        input,
        voice: { languageCode, name: voiceName },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate,
          sampleRateHertz: 24000,
        },
      });
    } catch (err: unknown) {
      const grpcErr = err as { code?: number; message?: string };
      this.logger.error(
        `Google Cloud TTS SDK error — gRPC code=${grpcErr?.code} message="${grpcErr?.message}"`,
        err,
      );
      throw err;
    }

    if (!response.audioContent) {
      throw new ServiceUnavailableException('Google Cloud TTS returned no audio content');
    }

    const buf = response.audioContent as Buffer;
    const audioBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;

    // Duration must be accurate — it drives story-reader karaoke pacing. Google
    // chooses the MP3 bitrate (often variable), so a byte-length estimate is
    // unreliable; parse the real duration from the MP3 frame headers and only fall
    // back to the rough estimate if parsing fails.
    const parsedMs = getMp3DurationMs(buf);
    if (parsedMs === null) {
      this.logger.warn(
        `Could not parse MP3 duration for ${characterCount}-char clip — ` +
        'falling back to byte-length estimate (may desync karaoke).',
      );
    }
    const durationMs = parsedMs ?? Math.round((audioBuffer.byteLength / 4000) * 1000);

    this.logger.debug(
      `GCTTS generated ${characterCount} chars → ${audioBuffer.byteLength} bytes ` +
      `(${durationMs}ms) via ${voiceName}`,
    );

    return { audioBuffer, durationMs, mimeType: 'audio/mpeg', characterCount };
  }

  /** Health check — verifies credentials without consuming quota */
  async ping(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      await this.client.listVoices({ languageCode: 'de-DE' });
      return true;
    } catch {
      return false;
    }
  }
}
