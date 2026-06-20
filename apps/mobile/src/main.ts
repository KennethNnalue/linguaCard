import { importProvidersFrom, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideServiceWorker } from '@angular/service-worker';
import { Drivers } from '@ionic/storage';
import { IonicStorageModule } from '@ionic/storage-angular';
import { MissingTranslationHandler, MissingTranslationHandlerParams, provideTranslateService, provideMissingTranslationHandler } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import localeEs from '@angular/common/locales/es';
import localeTr from '@angular/common/locales/tr';
import localeUk from '@angular/common/locales/uk';
import localeRu from '@angular/common/locales/ru';
import localeAr from '@angular/common/locales/ar';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { provideAi } from './app/features/ai/ai.providers';
import { provideVault } from './app/features/vault/vault.providers';
import { provideStories } from './app/features/stories/stories.providers';
import { provideReview } from './app/features/review/review.providers';
import { provideSettings } from './app/features/settings/settings.providers';

registerLocaleData(localeEs, 'es');
registerLocaleData(localeTr, 'tr');
registerLocaleData(localeUk, 'uk');
registerLocaleData(localeRu, 'ru');
registerLocaleData(localeAr, 'ar');

class LcMissingTranslationHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    if (isDevMode()) {
      console.warn(`[i18n] Missing translation: "${params.key}" (lang: ${params.translateService.currentLang})`);
    }
    return params.key;
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    importProvidersFrom(
      IonicStorageModule.forRoot({
        name: 'linguacard_db',
        driverOrder: [Drivers.IndexedDB, Drivers.LocalStorage],
      })
    ),
    provideTranslateService({ fallbackLang: 'en' }),
    provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
    provideMissingTranslationHandler(LcMissingTranslationHandler),
    provideAi(),
    provideVault(),
    provideStories(),
    provideReview(),
    provideSettings(),
  ],
});
