import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { DuplicateCheckResult, DuplicateCheckWord } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WordDedupApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/cards/check-duplicates`;

  checkDuplicates(words: DuplicateCheckWord[]): Promise<DuplicateCheckResult[]> {
    return firstValueFrom(
      this.http.post<DuplicateCheckResult[]>(this.apiUrl, { words }),
    );
  }
}
