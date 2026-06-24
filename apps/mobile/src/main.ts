import { importProvidersFrom, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
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
import { MissingTranslationHandlerParams, provideTranslateService, provideMissingTranslationHandler } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import localeEs from '@angular/common/locales/es';
import localeTr from '@angular/common/locales/tr';
import localeUk from '@angular/common/locales/uk';
import localeRu from '@angular/common/locales/ru';
import localeAr from '@angular/common/locales/ar';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { LanguageService } from './app/core/services/language.service';
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

// Provided via useFactory (a plain object, not a DI-constructed class) so the
// build never has to instantiate an inline class extending ngx-translate's
// abstract MissingTranslationHandler — that useClass path was throwing
// "Class constructor cannot be invoked without 'new'" in the prod bundle.
function lcMissingTranslationHandlerFactory(): { handle(params: MissingTranslationHandlerParams): string } {
  return {
    handle(params: MissingTranslationHandlerParams): string {
      if (isDevMode()) {
        console.warn(`[i18n] Missing translation: "${params.key}" (lang: ${params.translateService.currentLang})`);
      }
      return params.key;
    },
  };
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
    // Absolute path (not './') — a relative prefix resolves against the current
    // route (e.g. /stories/assets/i18n/en.json on deep links), which the SPA
    // rewrite then serves as index.html, breaking JSON parsing in production.
    provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    provideMissingTranslationHandler(lcMissingTranslationHandlerFactory),
    // Load the startup language bundle BEFORE first paint, so no `| translate`
    // pipe ever renders against an empty store (which would stick on raw keys
    // in production where the JSON arrives after the first render).
    provideAppInitializer(() => inject(LanguageService).initialize()),
    provideAi(),
    provideVault(),
    provideStories(),
    provideReview(),
    provideSettings(),
  ],
});
