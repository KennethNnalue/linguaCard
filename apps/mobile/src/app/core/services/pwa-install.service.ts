import {Injectable, signal} from '@angular/core';
import {Capacitor} from '@capacitor/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;

  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IOS_DISMISSED_KEY = 'lc_pwa_ios_dismissed';

@Injectable({providedIn: 'root'})
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly canInstall = signal(false);
  readonly canInstallIos = signal(false);
  readonly isInstalled = signal(false);

  constructor() {
    if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return;

    // Android / Chrome / Edge — browser-native install prompt
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isInstalled.set(true);
    });

    // Already running as installed PWA (Android/desktop standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled.set(true);
      return;
    }

    // iOS — Safari fires no beforeinstallprompt; detect platform manually
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(ua) ||
      // iPad on iOS 13+ reports as macOS with touch support
      (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);

    // Already installed as home-screen app on iOS
    const isIosStandalone =
      'standalone' in window.navigator &&
      (window.navigator as unknown as { standalone: boolean }).standalone;

    const dismissed = localStorage.getItem(IOS_DISMISSED_KEY) === 'true';

    if (isIosDevice && !isIosStandalone && !dismissed) {
      this.canInstallIos.set(true);
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;

    await this.deferredPrompt.prompt();
    const {outcome} = await this.deferredPrompt.userChoice;

    this.deferredPrompt = null;
    this.canInstall.set(false);

    return outcome === 'accepted';
  }

  dismiss(): void {
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }

  dismissIos(): void {
    localStorage.setItem(IOS_DISMISSED_KEY, 'true');
    this.canInstallIos.set(false);
  }
}
