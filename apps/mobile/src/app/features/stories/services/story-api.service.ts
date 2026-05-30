import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { GenerateStoryDto, Story } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class StoryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/stories`;

  getAll(): Observable<Story[]> {
    return this.http.get<Story[]>(this.baseUrl);
  }

  getById(id: string): Observable<Story> {
    return this.http.get<Story>(`${this.baseUrl}/${id}`);
  }

  generate(dto: GenerateStoryDto): Observable<Story> {
    return this.http.post<Story>(`${this.baseUrl}/generate`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  generateAudio(id: string): Observable<Story> {
    return this.http.post<Story>(`${this.baseUrl}/${id}/generate-audio`, {});
  }

  recordListen(id: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/listen`, {});
  }
}
