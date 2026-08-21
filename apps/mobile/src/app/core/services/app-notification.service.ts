import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';

type ToastOptions = NonNullable<Parameters<ToastController['create']>[0]>;

/**
 * Single creation point for transient application notifications.
 * Keeping placement and surface styling here prevents feature toasts from
 * covering primary controls such as the Review Player footer.
 */
@Injectable({ providedIn: 'root' })
export class AppNotificationService {
  private readonly toastController = inject(ToastController);

  create(options: ToastOptions): Promise<HTMLIonToastElement> {
    const featureClasses = Array.isArray(options.cssClass)
      ? options.cssClass
      : options.cssClass ? [options.cssClass] : [];
    return this.toastController.create({
      ...options,
      position: 'top',
      positionAnchor: undefined,
      cssClass: ['lc-app-notification', ...featureClasses],
    });
  }

  async present(options: ToastOptions): Promise<void> {
    const toast = await this.create(options);
    await toast.present();
  }
}
