import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type {
  AdminCreatePlatformCollectionImportDto,
  AdminPlatformCollectionImportPayload,
  AdminPlatformCollectionImportPreview,
  AdminPlatformCollectionImportResult,
  AdminPlatformCollectionImportStatus,
} from '@lingua-card/shared/domain';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PlatformCollectionImportApiService {
  private readonly http = inject(HttpClient);
  private readonly importsUrl = `${environment.apiUrl}/v2/admin/platform-collection-imports`;

  validate(
    payload: AdminPlatformCollectionImportPayload,
  ): Observable<AdminPlatformCollectionImportPreview> {
    return this.http.post<AdminPlatformCollectionImportPreview>(`${this.importsUrl}/validate`, payload);
  }

  importDraft(
    request: AdminCreatePlatformCollectionImportDto,
  ): Observable<AdminPlatformCollectionImportResult> {
    return this.http.post<AdminPlatformCollectionImportResult>(this.importsUrl, request);
  }

  retry(importId: string): Observable<AdminPlatformCollectionImportResult> {
    return this.http.post<AdminPlatformCollectionImportResult>(`${this.importsUrl}/${importId}/retry`, {});
  }

  status(importId: string): Observable<AdminPlatformCollectionImportStatus> {
    return this.http.get<AdminPlatformCollectionImportStatus>(`${this.importsUrl}/${importId}`);
  }
}
