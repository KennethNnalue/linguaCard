import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Card, Collection, CreateCollectionDto, UpdateCollectionDto } from '../models/mock-data';

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

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getCards(collectionId: string): Observable<Card[]> {
    return this.http.get<Card[]>(`${environment.apiUrl}/cards`, {
      params: { collectionId },
    });
  }

  clearCards(collectionId: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${environment.apiUrl}/cards/clear`, {
      params: { collectionId },
    });
  }
}
