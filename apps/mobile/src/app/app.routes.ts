import {Routes} from '@angular/router';
import {AuthGuard} from './core/guards/auth.guard';
import {TabsPage} from './tabs/tabs.page';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: '',
    component: TabsPage,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/pages/home/home.page').then(m => m.HomePage),
      },
      {
        path: 'vault',
        loadComponent: () =>
          import('./features/vault/pages/vault/vault.page').then(m => m.VaultPage),
      },
      {
        path: 'vault/import',
        loadComponent: () =>
          import('./features/vault/pages/import/import.page').then(m => m.ImportPage),
      },
      {
        path: 'vault/import/review',
        loadComponent: () =>
          import('./features/vault/pages/import-review/import-review.page').then(m => m.ImportReviewPage),
      },
      {
        path: 'vault/collections',
        loadComponent: () =>
          import('./features/vault/pages/collections/collections.page').then(m => m.CollectionsPage),
      },
      {
        path: 'vault/collections/:id',
        loadComponent: () =>
          import('./features/vault/pages/collection-detail/collection-detail.page').then(m => m.CollectionDetailPage),
      },
      {
        path: 'vault/:id',
        loadComponent: () =>
          import('./features/vault/pages/word-detail/word-detail.component').then(m => m.WordDetailComponent),
      },
      {
        path: 'review',
        loadComponent: () =>
          import('./features/review/pages/review/review.page').then(m => m.ReviewPage),
      },
      {
        path: 'listen',
        loadComponent: () =>
          import('./features/listen/pages/listen/listen.component').then(m => m.ListenComponent),
      },
      {
        path: 'progress',
        loadComponent: () =>
          import('./features/progress/pages/progress/progress.component').then(m => m.ProgressComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
