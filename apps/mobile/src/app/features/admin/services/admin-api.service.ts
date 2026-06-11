import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  AdminImportCollectionDto,
  AdminImportCollectionResult,
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportStoryDto,
  AdminImportStoryResult,
} from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  importCollection(dto: AdminImportCollectionDto): Observable<AdminImportCollectionResult> {
    return this.http.post<AdminImportCollectionResult>(`${this.apiUrl}/platform-collections/import`, dto);
  }

  importCollectionJson(dto: AdminImportCollectionJsonDto): Observable<AdminImportCollectionJsonResult> {
    return this.http.post<AdminImportCollectionJsonResult>(`${this.apiUrl}/platform-collections/import-json`, dto);
  }

  importStory(dto: AdminImportStoryDto): Observable<AdminImportStoryResult> {
    return this.http.post<AdminImportStoryResult>(`${this.apiUrl}/platform-stories/import`, dto);
  }
}
