import { Injectable, signal } from '@angular/core';
import { EnrichWordsResult, ImageImportResult, WordExtractionResult } from '@lingua-card/shared/domain';
import { PickedImage } from '../../../shared/image/image.model';

export type ImageImportErrorCode =
  | 'no_words'
  | 'blurry'
  | 'too_large'
  | 'ai_error'
  | 'quota_exceeded'
  | 'network_error';

@Injectable({ providedIn: 'root' })
export class ImageImportStateService {
  private readonly _image       = signal<PickedImage | null>(null);
  private readonly _result      = signal<ImageImportResult | null>(null);
  private readonly _extraction  = signal<WordExtractionResult | null>(null);
  private readonly _enrichment  = signal<EnrichWordsResult | null>(null);
  private readonly _error       = signal<ImageImportErrorCode | null>(null);

  readonly image      = this._image.asReadonly();
  readonly result     = this._result.asReadonly();
  readonly extraction = this._extraction.asReadonly();
  readonly enrichment = this._enrichment.asReadonly();
  readonly error      = this._error.asReadonly();

  setImage(img: PickedImage): void {
    this._image.set(img);
    this._error.set(null);
  }

  /** Legacy: set result from single-pass import */
  setResult(r: ImageImportResult): void { this._result.set(r); }

  /** Phase 1 result */
  setExtractionResult(r: WordExtractionResult): void { this._extraction.set(r); }

  /** Phase 2 result — also builds a compatible ImageImportResult for the review page */
  setEnrichResult(r: EnrichWordsResult): void {
    this._enrichment.set(r);
    // Build a legacy-compatible result so the review page can consume enriched words
    this._result.set({
      words: r.enriched,
      totalFound: (this._extraction()?.totalFound ?? r.enriched.length),
      imageDescription: this._extraction()?.imageDescription ?? '',
      processingMs: 0,
      modelUsed: this._extraction()?.modelUsed ?? '',
    });
  }

  setError(code: ImageImportErrorCode): void { this._error.set(code); }

  clearError(): void { this._error.set(null); }

  clear(): void {
    this._image.set(null);
    this._result.set(null);
    this._extraction.set(null);
    this._enrichment.set(null);
    this._error.set(null);
  }
}
