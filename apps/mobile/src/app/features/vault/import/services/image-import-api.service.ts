import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ImageImportRequest, ImageImportResult } from '@lingua-card/shared/domain';
import { AuthService } from '../../../../core/services/auth.service';
import { PickedImage } from '../../../../shared/image/image.model';
import { environment } from '../../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ImageImportApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  extractWords(image: PickedImage): Observable<ImageImportResult> {
    const body: ImageImportRequest = {
      imageBase64: image.base64,
      mimeType: image.mimeType,
      targetLanguage: 'de',
      nativeLanguage: 'en',
      userId: this.auth.currentUser()!.id,
      contextId: 'german-vocab',
    };
    return this.http.post<ImageImportResult>(`${environment.apiUrl}/import/image`, body);
  }
}
