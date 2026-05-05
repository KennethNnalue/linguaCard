import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Card } from '../models/mock-data';

@Injectable({ providedIn: 'root' })
export class CardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cards`;

  getAll(): Observable<Card[]> {
    return this.http.get<Card[]>(this.baseUrl);
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
}
