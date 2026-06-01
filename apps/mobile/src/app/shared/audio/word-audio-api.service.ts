import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  WordAudio,
  WordAudioResolveRequest,
  WordAudioResolveResponse,
  WordAudioBatchResolveResponse,
} from '@lingua-card/shared/domain';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WordAudioApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/word-audio`;

  resolve(text: string, language = 'de-DE'): Promise<WordAudioResolveResponse> {
    return firstValueFrom(
      this.http.post<WordAudioResolveResponse>(`${this.apiUrl}/resolve`, { text, language }),
    );
  }

  batchResolve(words: WordAudioResolveRequest[]): Promise<WordAudioBatchResolveResponse> {
    return firstValueFrom(
      this.http.post<WordAudioBatchResolveResponse>(`${this.apiUrl}/batch-resolve`, { words }),
    );
  }

  lookup(text: string, lang = 'de-DE'): Promise<WordAudio> {
    return firstValueFrom(
      this.http.get<WordAudio>(`${this.apiUrl}/lookup`, { params: { text, lang } }),
    );
  }
}
