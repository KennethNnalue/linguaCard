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
  AdminPlatformCollectionListItem,
  AdminPlatformStoryListItem,
  AdminSetStoryCategoryDto,
  AdminDiscountCodeListItem,
  AdminGenerateDiscountCodeDto,
  AdminSetDiscountCodeActiveDto,
} from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  listCollections(): Observable<AdminPlatformCollectionListItem[]> {
    return this.http.get<AdminPlatformCollectionListItem[]>(`${this.apiUrl}/platform-collections`);
  }

  listStories(): Observable<AdminPlatformStoryListItem[]> {
    return this.http.get<AdminPlatformStoryListItem[]>(`${this.apiUrl}/platform-stories`);
  }

  deleteCollection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/platform-collections/${id}`);
  }

  deleteStory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/platform-stories/${id}`);
  }

  setPublished(id: string, isPublished: boolean): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/platform-collections/${id}/publish`, { isPublished });
  }

  setStoryCategory(id: string, storyCategory: string | null): Observable<void> {
    const dto: AdminSetStoryCategoryDto = { storyCategory };
    return this.http.patch<void>(`${this.apiUrl}/platform-collections/${id}/story-category`, dto);
  }

  importCollection(dto: AdminImportCollectionDto): Observable<AdminImportCollectionResult> {
    return this.http.post<AdminImportCollectionResult>(`${this.apiUrl}/platform-collections/import`, dto);
  }

  importCollectionJson(dto: AdminImportCollectionJsonDto): Observable<AdminImportCollectionJsonResult> {
    return this.http.post<AdminImportCollectionJsonResult>(`${this.apiUrl}/platform-collections/import-json`, dto);
  }

  importStory(dto: AdminImportStoryDto): Observable<AdminImportStoryResult> {
    return this.http.post<AdminImportStoryResult>(`${this.apiUrl}/platform-stories/import`, dto);
  }

  regenerateStoryAudio(id: string): Observable<AdminImportStoryResult> {
    return this.http.post<AdminImportStoryResult>(`${this.apiUrl}/platform-stories/${id}/generate-audio`, {});
  }

  // ── Discount codes ─────────────────────────────────────────────────────────

  listDiscountCodes(): Observable<AdminDiscountCodeListItem[]> {
    return this.http.get<AdminDiscountCodeListItem[]>(`${this.apiUrl}/discount-codes`);
  }

  generateDiscountCode(dto: AdminGenerateDiscountCodeDto): Observable<AdminDiscountCodeListItem> {
    return this.http.post<AdminDiscountCodeListItem>(`${this.apiUrl}/discount-codes`, dto);
  }

  setDiscountCodeActive(id: string, isActive: boolean): Observable<void> {
    const dto: AdminSetDiscountCodeActiveDto = { isActive };
    return this.http.patch<void>(`${this.apiUrl}/discount-codes/${id}`, dto);
  }
}
