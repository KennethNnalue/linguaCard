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
  AdminPlatformCollectionWordItem,
  AdminPlatformStoryListItem,
  AdminSetStoryCategoryDto,
  AdminUpdatePlatformCollectionDto,
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

  listCollectionWords(id: string): Observable<AdminPlatformCollectionWordItem[]> {
    return this.http.get<AdminPlatformCollectionWordItem[]>(`${this.apiUrl}/platform-collections/${id}/words`);
  }

  reorderCollectionWords(id: string, itemIds: string[]): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/platform-collections/${id}/words/order`, { itemIds });
  }

  removeCollectionWord(id: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/platform-collections/${id}/words/${itemId}`);
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

  uploadCollectionCover(id: string, image: File): Observable<{ coverImageUrl: string }> {
    const formData = new FormData();
    formData.append('image', image);
    return this.http.post<{ coverImageUrl: string }>(`${this.apiUrl}/platform-collections/${id}/cover`, formData);
  }

  updateCollection(
    id: string,
    dto: AdminUpdatePlatformCollectionDto,
  ): Observable<AdminPlatformCollectionListItem> {
    return this.http.patch<AdminPlatformCollectionListItem>(`${this.apiUrl}/platform-collections/${id}`, dto);
  }

  importStory(dto: AdminImportStoryDto): Observable<AdminImportStoryResult> {
    return this.http.post<AdminImportStoryResult>(`${this.apiUrl}/platform-stories/import`, dto);
  }

  regenerateStoryAudio(id: string): Observable<AdminImportStoryResult> {
    return this.http.post<AdminImportStoryResult>(`${this.apiUrl}/platform-stories/${id}/generate-audio`, {});
  }

  setPublishedStory(id: string, isPublished: boolean): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/platform-stories/${id}/publish`, { isPublished });
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
