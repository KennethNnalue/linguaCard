import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/ai.config';

const REQUEST_TIMEOUT_MS = 120_000;

@Injectable()
export class ElevenLabsPodcastAdapter {
  private readonly logger = new Logger(ElevenLabsPodcastAdapter.name);
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<AiConfig>('ai')?.elevenLabsApiKey ?? '';
  }

  async create(input: {
    title: string;
    language: string;
    sourceText: string;
    hostVoiceId: string;
    guestVoiceId: string;
  }): Promise<string> {
    if (!this.apiKey) throw new ServiceUnavailableException('ElevenLabs is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/studio/podcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': this.apiKey },
        body: JSON.stringify({
          model_id: 'eleven_multilingual_v2',
          mode: { type: 'conversation', conversation: {
            host_voice_id: input.hostVoiceId, guest_voice_id: input.guestVoiceId,
          } },
          source: { type: 'text', text: input.sourceText },
          language: input.language,
          duration_scale: 'short',
          instructions_prompt: `Create a beginner-friendly language-learning podcast named “${input.title}”. Use every vocabulary item and explain each naturally.`,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`ElevenLabs podcast creation failed with status ${response.status}`);
        throw new ServiceUnavailableException('ElevenLabs rejected the podcast request. Studio API access may need to be enabled.');
      }
      const value: unknown = await response.json();
      if (!isRecord(value) || !isRecord(value['project']) || typeof value['project']['project_id'] !== 'string') {
        throw new ServiceUnavailableException('ElevenLabs returned an invalid podcast project');
      }
      return value['project']['project_id'];
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('ElevenLabs podcast creation failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
