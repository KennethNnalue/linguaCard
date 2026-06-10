import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { PushApiService } from './push-api.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(PushApiService);
  private readonly router = inject(Router);

  get isSupported(): boolean {
    return this.swPush.isEnabled;
  }

  async enable(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;
    try {
      const { publicKey } = await firstValueFrom(this.api.vapidPublicKey());
      const sub = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      const subJson = sub.toJSON() as { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } };
      await firstValueFrom(this.api.subscribe(subJson));
      this.swPush.notificationClicks.subscribe(({ notification }) => {
        const url = (notification as { data?: { url?: string } }).data?.url ?? '/review';
        void this.router.navigateByUrl(url);
      });
      return true;
    } catch {
      return false;
    }
  }

  async disable(): Promise<void> {
    const sub = await firstValueFrom(this.swPush.subscription);
    if (sub) {
      await firstValueFrom(this.api.unsubscribe(sub.endpoint));
      await sub.unsubscribe();
    }
  }
}
