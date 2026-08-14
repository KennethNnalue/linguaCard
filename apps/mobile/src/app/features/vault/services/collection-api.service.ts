import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Card, Collection, CreateCollectionDto, RawExtractedWord, UpdateCollectionDto } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/collections`;

  getAll(): Observable<Collection[]> {
    return this.http.get<Collection[]>(this.baseUrl);
  }

  getById(id: string): Observable<Collection> {
    return this.http.get<Collection>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateCollectionDto): Observable<Collection> {
    return this.http.post<Collection>(this.baseUrl, dto);
  }

  update(id: string, dto: UpdateCollectionDto): Observable<Collection> {
    return this.http.patch<Collection>(`${this.baseUrl}/${id}`, dto);
  }

  markIncomplete(id: string, pendingWords: RawExtractedWord[]): Observable<Collection> {
    return this.http.patch<Collection>(`${this.baseUrl}/${id}`, {
      importStatus: 'incomplete',
      pendingWords,
    });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getCards(collectionId: string): Observable<Card[]> {
    return this.http.get<Card[]>(`${environment.apiUrl}/cards`, {
      params: { collectionId },
    });
  }

  /** Assigns an existing card to a collection without creating a new card. */
  addExistingCard(collectionId: string, cardId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${collectionId}/cards/${cardId}`, {});
  }

  clearCards(collectionId: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${environment.apiUrl}/cards/clear`, {
      params: { collectionId },
    });
  }

  removeAll(): Observable<void> {
    return this.getAll().pipe(
      switchMap(collections =>
        collections.length === 0
          ? of(undefined as void)
          : forkJoin(collections.map(c => this.remove(c.id))).pipe(map(() => undefined as void))
      )
    );
  }
}
