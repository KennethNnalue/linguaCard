import { Injectable, signal } from '@angular/core';
import { ParsedImportResult } from '../../../core/models/mock-data';

@Injectable({ providedIn: 'root' })
export class ImportStateService {
  private readonly _result = signal<ParsedImportResult | null>(null);
  readonly result = this._result.asReadonly();

  set(result: ParsedImportResult): void {
    this._result.set(result);
  }

  clear(): void {
    this._result.set(null);
  }
}
