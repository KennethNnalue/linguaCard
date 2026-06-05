import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { EnrichOneRequest, EnrichOneResult } from '@lingua-card/shared/domain';
import { environment } from '../../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EnrichOneApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/import/enrich-one`;

  enrich(dto: EnrichOneRequest): Observable<EnrichOneResult> {
    return this.http.post<EnrichOneResult>(this.url, dto);
  }
}
