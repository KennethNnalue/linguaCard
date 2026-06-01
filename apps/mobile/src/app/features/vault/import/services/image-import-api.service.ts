import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  EnrichWordsRequest,
  EnrichWordsResult,
  ImageImportRequest,
  ImageImportResult,
  RawExtractedWord,
  WordExtractionResult,
} from '@lingua-card/shared/domain';
import { AuthService } from '../../../../core/services/auth.service';
import { PickedImage } from '../../../../shared/image/image.model';
import { environment } from '../../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ImageImportApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiUrl}/import`;

  /** Legacy single-pass endpoint — used as fallback */
  extractWordsSinglePass(image: PickedImage): Observable<ImageImportResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType:    image.mimeType,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      userId:      this.auth.currentUser()!.id,
      contextId:   'german-vocab',
    };
    return this.http.post<ImageImportResult>(`${this.base}/image`, body);
  }

  /** Phase 1: extract raw words from image */
  extractWords(image: PickedImage): Observable<WordExtractionResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType:    image.mimeType,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      userId:      this.auth.currentUser()!.id,
      contextId:   'german-vocab',
    };
    return this.http.post<WordExtractionResult>(`${this.base}/image/extract`, body);
  }

  /** Phase 2: enrich raw words into full card data */
  enrichWords(req: EnrichWordsRequest): Observable<EnrichWordsResult> {
    return this.http.post<EnrichWordsResult>(`${this.base}/enrich`, req);
  }

  /** Resume enrichment for an incomplete collection */
  completeCollection(collectionId: string): Observable<{
    newCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    return this.http.post<{ newCards: number; pendingWords: RawExtractedWord[]; isComplete: boolean }>(
      `${this.base}/complete/${collectionId}`,
      {},
    );
  }
}
