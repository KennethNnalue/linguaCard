import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import type { AiConfig } from '../../config/ai.config';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL   = 'whisper-large-v3-turbo';

/**
 * DORMANT — Whisper word-level timestamps are not yet integrated in production.
 *
 * `GROQ_API_KEY` is currently unset, so `transcribeWithTimestamps` returns `[]`
 * (see the guard below) and stories ship with empty `wordTimestamps`. Karaoke is
 * driven at SENTENCE granularity from estimated per-sentence time slices
 * (StoryTokenizerService.computeSentencePlan on the client), so it works
 * without this adapter. When Whisper is enabled later, that same tokenizer will
 * automatically refine sentence boundaries from real word timestamps — keep this
 * adapter and its wiring intact for that.
 */
@Injectable()
export class GroqWhisperAdapter {
  private readonly logger = new Logger(GroqWhisperAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<AiConfig>('ai')!.groqApiKey;
  }

  async transcribeWithTimestamps(
    audioBuffer: ArrayBuffer,
    mimeType = 'audio/wav',
  ): Promise<WordTimestamp[]> {
    if (!this.apiKey) {
      this.logger.warn('GROQ_API_KEY not configured — karaoke timestamps unavailable');
      return [];
    }

    const ext  = mimeType.includes('mp3') ? 'audio.mp3' : 'audio.wav';
    const blob = new Blob([audioBuffer], { type: mimeType });

    const form = new FormData();
    form.append('file', blob, ext);
    form.append('model', GROQ_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'de');

    let res: Response;
    try {
      res = await fetch(GROQ_STT_URL, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body:    form,
      });
    } catch (networkErr) {
      this.logger.error('Groq Whisper network error', networkErr);
      return [];
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Groq Whisper HTTP ${res.status}`, text);
      return [];
    }

    const data = await res.json() as { words?: Array<{ word: string; start: number; end: number }> };

    return (data.words ?? []).map(w => ({
      word:    w.word.trim(),
      startMs: Math.round(w.start * 1000),
      endMs:   Math.round(w.end   * 1000),
      isVocab: false,
      cardId:  undefined,
    }));
  }
}
