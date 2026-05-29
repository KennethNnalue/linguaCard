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
          import('./features/review/pages/review-hub/review-hub.page').then(m => m.ReviewHubPage),
      },
      {
        path: 'review/player',
        loadComponent: () =>
          import('./features/review/pages/review/review.page').then(m => m.ReviewPage),
      },
      {
        path: 'review/summary',
        loadComponent: () =>
          import('./features/review/pages/session-summary/session-summary.page')
            .then(m => m.SessionSummaryPage),
      },
      {
        path: 'review/custom',
        loadComponent: () =>
          import('./features/review/pages/custom-study/custom-study.page').then(m => m.CustomStudyPage),
      },
      {
        path: 'review/mastery',
        loadComponent: () =>
          import('./features/review/pages/mastery-breakdown/mastery-breakdown.page').then(m => m.MasteryBreakdownPage),
      },
      {
        path: 'review/history',
        loadComponent: () =>
          import('./features/review/pages/session-history/session-history.page').then(m => m.SessionHistoryPage),
      },
      {
        path: 'review/struggling',
        loadComponent: () =>
          import('./features/review/pages/struggling-cards/struggling-cards.page').then(m => m.StrugglingCardsPage),
      },
      {
        path: 'listen',
        loadComponent: () =>
          import('./features/listen/pages/listen/listen.component').then(m => m.ListenComponent),
      },
      {
        path: 'stories',
        loadComponent: () =>
          import('./features/stories/pages/story-library/story-library.page').then(m => m.StoryLibraryPage),
      },
      {
        path: 'stories/:id',
        loadComponent: () =>
          import('./features/stories/pages/story-reader/story-reader.page').then(m => m.StoryReaderPage),
      },
      {
        path: 'stories/:id/complete',
        loadComponent: () =>
          import('./features/stories/pages/story-complete/story-complete.page').then(m => m.StoryCompletePage),
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
