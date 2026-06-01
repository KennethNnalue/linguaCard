import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly _isOnline = signal(navigator.onLine);

  readonly isOnline = this._isOnline.asReadonly();
  readonly isOffline = (() => {
    const svc = this;
    return () => !svc._isOnline();
  })();

  constructor() {
    Network.addListener('networkStatusChange', ({ connected }) => {
      this._isOnline.set(connected);
    });
  }
}
