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
import { VaultV2Store } from '../../store/vault-v2.store';

@Injectable({ providedIn: 'root' })
export class ImageImportApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly vaultStore = inject(VaultV2Store);
  private readonly base = `${environment.apiUrl}/import`;

  /** Legacy single-pass endpoint — used as fallback */
  extractWordsSinglePass(image: PickedImage): Observable<ImageImportResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType:    image.mimeType,
      targetLanguage: this.activeLanguages().targetLanguage,
      nativeLanguage: this.activeLanguages().sourceLanguage,
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
      targetLanguage: this.activeLanguages().targetLanguage,
      nativeLanguage: this.activeLanguages().sourceLanguage,
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
    reusedCards: number;
    pendingWords: RawExtractedWord[];
    isComplete: boolean;
  }> {
    return this.http.post<{
      newCards: number;
      reusedCards: number;
      pendingWords: RawExtractedWord[];
      isComplete: boolean;
    }>(`${this.base}/complete/${collectionId}`, {});
  }

  activeLanguages(): { sourceLanguage: string; targetLanguage: string } {
    const context = this.vaultStore.vault()?.learningContext;
    return {
      sourceLanguage: context?.sourceLanguage ?? 'en',
      targetLanguage: context?.targetLanguage ?? 'de',
    };
  }
}
