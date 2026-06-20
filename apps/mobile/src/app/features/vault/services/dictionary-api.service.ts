import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { DictionaryBatchResolveResult, RawWordInput, WordDictionaryEntry } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';
import { LanguageService } from '../../../core/services/language.service';

@Injectable({ providedIn: 'root' })
export class DictionaryApiService {
  private readonly http = inject(HttpClient);
  private readonly languageService = inject(LanguageService);
  private readonly apiUrl = `${environment.apiUrl}/word-dictionary`;

  lookup(
    text: string,
    article?: string | null,
    targetLang = 'de-DE',
    nativeLang?: string,
  ): Observable<{ entry: WordDictionaryEntry | null }> {
    return this.http.post<{ entry: WordDictionaryEntry | null }>(`${this.apiUrl}/lookup`, {
      text,
      article: article ?? null,
      targetLang,
      nativeLang: nativeLang ?? this.languageService.current(),
    });
  }

  batchCheck(
    words: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang?: string,
  ): Observable<{ entries: WordDictionaryEntry[] }> {
    return this.http.post<{ entries: WordDictionaryEntry[] }>(`${this.apiUrl}/batch-check`, {
      words,
      targetLang,
      nativeLang: nativeLang ?? this.languageService.current(),
    });
  }

  batchLookup(
    words: RawWordInput[],
    targetLang = 'de-DE',
    nativeLang?: string,
  ): Observable<DictionaryBatchResolveResult> {
    return this.http.post<DictionaryBatchResolveResult>(`${this.apiUrl}/batch-lookup`, {
      words,
      targetLang,
      nativeLang: nativeLang ?? this.languageService.current(),
    });
  }
}
