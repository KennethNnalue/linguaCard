import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Card } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class CardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cards`;

  getAll(params?: { collectionId?: string }): Observable<Card[]> {
    const httpParams: Record<string, string> = {};
    if (params?.collectionId) httpParams['collectionId'] = params.collectionId;
    return this.http.get<Card[]>(this.baseUrl, { params: httpParams });
  }

  getById(id: string): Observable<Card> {
    return this.http.get<Card>(`${this.baseUrl}/${id}`);
  }

  create(payload: Omit<Card, 'id'>): Observable<Card> {
    return this.http.post<Card>(this.baseUrl, payload);
  }

  update(id: string, patch: Partial<Card>): Observable<Card> {
    return this.http.patch<Card>(`${this.baseUrl}/${id}`, patch);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  removeAll(): Observable<void> {
    return this.getAll().pipe(
      switchMap(cards =>
        cards.length === 0
          ? of(undefined as void)
          : forkJoin(cards.map(c => this.remove(c.id))).pipe(map(() => undefined as void))
      )
    );
  }
}
