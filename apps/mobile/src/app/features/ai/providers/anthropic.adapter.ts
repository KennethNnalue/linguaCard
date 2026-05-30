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
export class AnthropicAdapter implements AIProvider {
  readonly name = 'anthropic' as const;
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/ai`;

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    return firstValueFrom(
      this.http.post<AITextResponse>(`${this.baseUrl}/generate-text`, request),
    );
  }

  generateSpeech(_request: AISpeechRequest): Promise<AISpeechResponse> {
    throw new Error('AnthropicAdapter does not support speech generation. Use OpenAIAdapter.');
  }

  transcribeWithTimestamps(_audioBuffer: ArrayBuffer): Promise<WordTimestamp[]> {
    throw new Error('AnthropicAdapter does not support transcription. Use OpenAIAdapter.');
  }
}
