import { Injectable, Logger, ServiceUnavailableException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import type { AITextRequest, AITextResponse } from './anthropic.adapter';

export interface AISpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
}

export interface AISpeechResponse {
  audioBuffer: ArrayBuffer;
  durationMs: number;
  mimeType: string;
}

const TEXT_MODEL        = 'gemini-2.5-flash';
const TTS_MODEL         = 'gemini-2.5-flash-preview-tts';
const VISION_LITE_MODEL = 'gemini-2.5-flash-lite';

// Free-tier limit: 3 requests/minute for gemini-2.5-flash-tts.
// Token bucket: refill 1 token every 20s (= 3/min). Max burst = 3.
const TTS_TOKENS_PER_MIN = 3;
const TTS_REFILL_INTERVAL_MS = Math.ceil(60_000 / TTS_TOKENS_PER_MIN); // 20 000 ms

// Gemini TTS voices suitable for German narration.
// See: https://ai.google.dev/gemini-api/docs/speech-generation
const DEFAULT_VOICE = 'Kore';

@Injectable()
export class GeminiAdapter {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly ai: GoogleGenAI;

  // Token-bucket state for TTS rate limiting
  private ttsTokens = TTS_TOKENS_PER_MIN;
  private lastTtsRefill = Date.now();

  constructor() {
    const key = process.env['GEMINI_API_KEY'] ?? '';
    this.logger.log(`Gemini key loaded: ${key ? key.substring(0, 10) + '...' : 'EMPTY'}`);
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  private refillTtsTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastTtsRefill;
    const newTokens = Math.floor(elapsed / TTS_REFILL_INTERVAL_MS);
    if (newTokens > 0) {
      this.ttsTokens = Math.min(TTS_TOKENS_PER_MIN, this.ttsTokens + newTokens);
      this.lastTtsRefill = now;
    }
  }

  private consumeTtsToken(): boolean {
    this.refillTtsTokens();
    if (this.ttsTokens > 0) {
      this.ttsTokens--;
      return true;
    }
    return false;
  }

  async generateVision(opts: {
    imageBase64: string;
    mimeType: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: opts.mimeType, data: opts.imageBase64 } },
              { text: opts.prompt },
            ],
          },
        ],
        config: {
          maxOutputTokens: opts.maxTokens ?? 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      return response.text ?? '';
    } catch (err: any) {
      if (err?.status === 429) {
        const retryMatch = String(err?.message ?? '').match(/"retryDelay"\s*:\s*"(\d+)s"/);
        const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : 60_000;
        this.logger.warn(`Gemini vision 429: retry after ${retryAfterMs}ms`);
        throw new HttpException(
          { message: 'AI quota exceeded. Please try again later.', retryAfterMs },
          429,
        );
      }
      throw err;
    }
  }

  async generateVisionLite(opts: {
    imageBase64: string;
    mimeType:    string;
    prompt:      string;
    maxTokens?:  number;
  }): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: VISION_LITE_MODEL,
        contents: [
          {
            role:  'user',
            parts: [
              { inlineData: { mimeType: opts.mimeType, data: opts.imageBase64 } },
              { text: opts.prompt },
            ],
          },
        ],
        config: {
          maxOutputTokens: opts.maxTokens ?? 4096,
          thinkingConfig:  { thinkingBudget: 0 },
        },
      });
      return response.text ?? '';
    } catch (err: any) {
      if (err?.status === 429) {
        throw new HttpException(
          { message: 'AI quota exceeded. Please try again later.' },
          429,
        );
      }
      throw new InternalServerErrorException('AI processing failed. Please try again.');
    }
  }

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const prompt = request.messages.map(m => m.content).join('\n\n');

    const response = await this.ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: request.maxTokens ?? 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return {
      text: response.text ?? '',
      model: TEXT_MODEL,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse> {
    // Check local token bucket before hitting the API
    if (!this.consumeTtsToken()) {
      const retryAfterMs = TTS_REFILL_INTERVAL_MS;
      this.logger.warn(`TTS rate limit (local bucket): retry after ${retryAfterMs}ms`);
      throw new HttpException(
        { message: 'TTS rate limit exceeded', retryAfterMs },
        429,
      );
    }

    const voiceName = request.voice ?? DEFAULT_VOICE;
    const languageCode = request.language ?? 'de-DE';

    let response: Awaited<ReturnType<typeof this.ai.models.generateContent>>;
    try {
      response = await this.ai.models.generateContent({
        model: TTS_MODEL,
        contents: request.text,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
            languageCode,
          },
        },
      });
    } catch (err: any) {
      // Propagate 429 from Gemini with the retryDelay the API provided
      if (err?.status === 429) {
        const retryMatch = String(err?.message ?? '').match(/retryDelay[^\d]*(\d+)/);
        const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : 30_000;
        this.logger.warn(`Gemini TTS 429: retry after ${retryAfterMs}ms`);
        // Return a consumed token to the bucket since the API rejected it
        this.ttsTokens = Math.min(TTS_TOKENS_PER_MIN, this.ttsTokens + 1);
        throw new HttpException(
          { message: 'TTS rate limit exceeded', retryAfterMs },
          429,
        );
      }
      throw err;
    }

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
      this.logger.error(
        'Gemini TTS empty response. candidates: ' +
        JSON.stringify(response.candidates?.map(c => ({
          finishReason: c.finishReason,
          parts: c.content?.parts?.map(p => ({ hasInline: !!p.inlineData, text: p.text })),
        }))),
      );
      throw new ServiceUnavailableException('Gemini TTS returned no audio data');
    }

    const base64 = part.inlineData.data;
    const pcmBuffer = Buffer.from(base64, 'base64');

    // Gemini returns raw 16-bit signed PCM at 24 kHz mono.
    // Wrap it in a RIFF/WAV header so browsers can decode it.
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const wavBuffer = this.pcmToWav(pcmBuffer, sampleRate, numChannels, bitsPerSample);

    const audioBuffer = wavBuffer.buffer.slice(
      wavBuffer.byteOffset,
      wavBuffer.byteOffset + wavBuffer.byteLength,
    ) as ArrayBuffer;

    // bytes/sec for 24kHz 16-bit mono = sampleRate * channels * (bits/8)
    const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
    const durationMs = Math.round((pcmBuffer.byteLength / bytesPerSecond) * 1000);

    return { audioBuffer, durationMs, mimeType: 'audio/wav' };
  }

  private pcmToWav(pcm: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.byteLength;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);   // ChunkSize
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);             // Subchunk1Size (PCM)
    header.writeUInt16LE(1, 20);              // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcm]);
  }
}
