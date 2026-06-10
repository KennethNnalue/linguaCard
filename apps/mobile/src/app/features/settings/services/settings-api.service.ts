import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/settings`;

  get(): Observable<UserSettings> {
    return this.http.get<UserSettings>(`${this.base}/me`);
  }

  update(dto: UpdateUserSettingsDto): Observable<UserSettings> {
    return this.http.patch<UserSettings>(`${this.base}/me`, dto);
  }
}
