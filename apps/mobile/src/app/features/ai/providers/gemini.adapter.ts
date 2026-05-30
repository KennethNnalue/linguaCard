import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { WordTimestamp } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';
import type {
  AIProvider,
  AITextRequest,
  AITextResponse,
  AISpeechRequest,
  AISpeechResponse,
} from './ai-provider.interface';

@Injectable({ providedIn: 'root' })
export class GeminiAdapter implements AIProvider {
  readonly name = 'gemini' as const;
  private readonly http = inject(HttpClient);
  private readonly ttsUrl = `${environment.apiUrl}/ai/tts`;

  generateText(_request: AITextRequest): Promise<AITextResponse> {
    throw new Error('GeminiAdapter (Angular) does not support text generation. Use AnthropicAdapter.');
  }

  async generateSpeech(request: AISpeechRequest): Promise<AISpeechResponse> {
    const blob = await firstValueFrom(
      this.http.post(this.ttsUrl, {
        text: request.text,
        voice: request.voice,
        language: request.language ?? 'de-DE',
      }, { responseType: 'blob' }),
    );

    const audioBuffer = await blob.arrayBuffer();
    // Estimate duration: 24kHz 16-bit mono PCM = 48000 bytes/sec; WAV header adds ~44 bytes (negligible)
    const mimeType = blob.type || 'audio/wav';
    const bytesPerSecond = mimeType.includes('pcm') ? 48000 : 16000;
    const durationMs = Math.round((audioBuffer.byteLength / bytesPerSecond) * 1000);

    return { audioBuffer, durationMs };
  }

  transcribeWithTimestamps(_audioBuffer: ArrayBuffer): Promise<WordTimestamp[]> {
    throw new Error('GeminiAdapter does not support transcription. Use OpenAIAdapter.');
  }
}
