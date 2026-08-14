import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Card, CardAdministrationCommand, CardAdministrationResult, ScheduledCard } from '@lingua-card/shared/domain';
import { UpdateCardDto } from '@lingua-card/shared/dto';

@Injectable({ providedIn: 'root' })
export class CardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cards`;

  getAll(params?: { collectionId?: string }): Observable<ScheduledCard[]> {
    const httpParams: Record<string, string> = {};
    if (params?.collectionId) httpParams['collectionId'] = params.collectionId;
    return this.http.get<ScheduledCard[]>(this.baseUrl, { params: httpParams });
  }

  getById(id: string): Observable<ScheduledCard> {
    return this.http.get<ScheduledCard>(`${this.baseUrl}/${id}`);
  }

  create(payload: Omit<Card, 'id'>): Observable<ScheduledCard> {
    return this.http.post<ScheduledCard>(this.baseUrl, payload);
  }

  update(id: string, dto: UpdateCardDto): Observable<ScheduledCard> {
    return this.http.patch<ScheduledCard>(`${this.baseUrl}/${id}`, dto);
  }

  executeAdministration(id: string, command: CardAdministrationCommand): Observable<CardAdministrationResult> {
    return this.http.post<CardAdministrationResult>(`${this.baseUrl}/${id}/administration`, command);
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
