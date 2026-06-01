import { Injectable, signal } from '@angular/core';
import { ImageImportResult } from '@lingua-card/shared/domain';
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
  private readonly _image = signal<PickedImage | null>(null);
  private readonly _result = signal<ImageImportResult | null>(null);
  private readonly _error = signal<ImageImportErrorCode | null>(null);

  readonly image = this._image.asReadonly();
  readonly result = this._result.asReadonly();
  readonly error = this._error.asReadonly();

  setImage(img: PickedImage): void {
    this._image.set(img);
    this._error.set(null);
  }

  setResult(r: ImageImportResult): void { this._result.set(r); }

  setError(code: ImageImportErrorCode): void { this._error.set(code); }

  clearError(): void { this._error.set(null); }

  clear(): void {
    this._image.set(null);
    this._result.set(null);
    this._error.set(null);
  }
}
