import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Category } from '../models/mock-data';

@Injectable({ providedIn: 'root' })
export class CategoryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/categories`;

  getAll(): Observable<Category[]> {
    return this.http.get<Category[]>(this.baseUrl);
  }

  getById(id: string): Observable<Category> {
    return this.http.get<Category>(`${this.baseUrl}/${id}`);
  }

  create(dto: { name: string; colour?: string }): Observable<Category> {
    return this.http.post<Category>(this.baseUrl, {
      ...dto,
      colour: dto.colour ?? '#2D5A4E',
      cardCount: 0,
      userId: 'user-001',
      createdAt: new Date().toISOString(),
    });
  }

  update(id: string, dto: Partial<Pick<Category, 'name' | 'colour'>>): Observable<Category> {
    return this.http.patch<Category>(`${this.baseUrl}/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
