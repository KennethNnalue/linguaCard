import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { RedeemDiscountCodeDto, RedeemDiscountResult } from '@lingua-card/shared/domain';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DiscountApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/discount-codes`;

  redeemCode(dto: RedeemDiscountCodeDto): Observable<RedeemDiscountResult> {
    return this.http.post<RedeemDiscountResult>(`${this.apiUrl}/redeem`, dto);
  }
}
