import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { PendingReviewCommit } from '../domain/review-persistence';

@Injectable({ providedIn: 'root' })
export class ReviewCommitApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/review/commits`;

  commitBatch(commits: readonly PendingReviewCommit[]): Observable<{ accepted: number; duplicates: number }> {
    return this.http.post<{ accepted: number; duplicates: number }>(`${this.apiUrl}/batch`, { commits });
  }
}
