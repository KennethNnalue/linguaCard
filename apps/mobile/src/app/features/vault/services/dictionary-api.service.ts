import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { DictionaryBatchResolveResult, RawWordInput, WordDictionaryEntry } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DictionaryApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/word-dictionary`;

  lookup(
    text: string,
    article?: string | null,
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Observable<{ entry: WordDictionaryEntry | null }> {
    return this.http.post<{ entry: WordDictionaryEntry | null }>(`${this.apiUrl}/lookup`, {
      text,
      article: article ?? null,
      targetLang,
      nativeLang,
    });
  }

  /**
   * Read-only check — returns only words already known to the dictionary.
   * Never triggers AI enrichment. Use on review screens before the user confirms.
   */
  batchCheck(
    words: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Observable<{ entries: WordDictionaryEntry[] }> {
    return this.http.post<{ entries: WordDictionaryEntry[] }>(`${this.apiUrl}/batch-check`, {
      words,
      targetLang,
      nativeLang,
    });
  }

  /**
   * Resolve batch — looks up existing entries and enriches misses via AI.
   * Call this at import-confirm time, not during review.
   */
  batchLookup(
    words: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang = 'en',
  ): Observable<DictionaryBatchResolveResult> {
    return this.http.post<DictionaryBatchResolveResult>(`${this.apiUrl}/batch-lookup`, {
      words,
      targetLang,
      nativeLang,
    });
  }
}
