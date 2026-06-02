import { importProvidersFrom, isDevMode, provideZoneChangeDetection } from '@angular/core';
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
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { provideAi } from './app/features/ai/ai.providers';
import { provideVault } from './app/features/vault/vault.providers';
import { provideStories } from './app/features/stories/stories.providers';
import { provideReview } from './app/features/review/review.providers';

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
    provideAi(),
    provideVault(),
    provideStories(),
    provideReview(),
  ],
});
