import {Routes} from '@angular/router';
import {AuthGuard} from './core/guards/auth.guard';
import {AdminGuard} from './core/guards/admin.guard';
import {onboardingGuard, onboardingCompleteGuard} from './core/guards/onboarding.guard';
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
    path: 'onboarding',
    canActivate: [AuthGuard, onboardingCompleteGuard],
    loadChildren: () =>
      import('./features/onboarding/onboarding.routes').then(m => m.ONBOARDING_ROUTES),
  },
  {
    path: '',
    component: TabsPage,
    canActivate: [AuthGuard, onboardingGuard],
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
        path: 'vault/import/image',
        loadComponent: () =>
          import('./features/vault/import/pages/image-import/image-import.page').then(m => m.ImageImportPage),
      },
      {
        path: 'vault/import/image/processing',
        loadComponent: () =>
          import('./features/vault/import/pages/image-processing/image-processing.page').then(m => m.ImageProcessingPage),
      },
      {
        path: 'vault/import/image/review',
        loadComponent: () =>
          import('./features/vault/import/pages/image-import-review/image-import-review.page').then(m => m.ImageImportReviewPage),
      },
      // The standalone Collections list + Explore-topic pages are retired — the
      // Vault home now owns personal collections (shelves) and the in-page Explore.
      // /vault/collections redirects to the Vault for any lingering deep links.
      {
        path: 'vault/collections',
        redirectTo: 'vault',
        pathMatch: 'full',
      },
      {
        path: 'vault/collections/platform/:id',
        loadComponent: () =>
          import('./features/vault/pages/platform-collection-detail/platform-collection-detail.page')
            .then(m => m.PlatformCollectionDetailPage),
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
        redirectTo: 'review',
        pathMatch: 'full',
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
        path: 'review/progress',
        loadComponent: () =>
          import('./features/engagement/pages/engagement-progress/engagement-progress.page')
            .then(m => m.EngagementProgressPage),
      },
      {
        path: 'review/struggling',
        loadComponent: () =>
          import('./features/review/pages/struggling-cards/struggling-cards.page').then(m => m.StrugglingCardsPage),
      },
      {
        path: 'review/leeches',
        loadComponent: () =>
          import('./features/review/pages/leeches/leeches.page').then(m => m.LeechesPage),
      },
      {
        path: 'listen',
        loadComponent: () =>
          import('./features/listen/pages/listen/listen.component').then(m => m.ListenComponent),
      },
      {
        path: 'listen/now-playing',
        loadComponent: () =>
          import('./features/listen/pages/now-playing/now-playing.page').then(m => m.NowPlayingPage),
      },
      {
        path: 'listen/complete',
        loadComponent: () =>
          import('./features/listen/pages/listen-complete/listen-complete.page').then(m => m.ListenCompletePage),
      },
      {
        path: 'podcasts',
        loadComponent: () => import('./features/podcasts/pages/podcast-library/podcast-library.page')
          .then(m => m.PodcastLibraryPage),
      },
      {
        path: 'podcasts/topics/:topicId',
        loadComponent: () => import('./features/podcasts/pages/podcast-topic/podcast-topic.page')
          .then(m => m.PodcastTopicPage),
      },
      {
        path: 'podcasts/episodes/:episodeId',
        loadComponent: () => import('./features/podcasts/pages/podcast-preparation/podcast-preparation.page')
          .then(m => m.PodcastPreparationPage),
      },
      {
        path: 'podcasts/episodes/:episodeId/player',
        loadComponent: () => import('./features/podcasts/pages/podcast-player/podcast-player.page')
          .then(m => m.PodcastPlayerPage),
      },
      {
        path: 'podcasts/episodes/:episodeId/complete',
        loadComponent: () => import('./features/podcasts/pages/podcast-completion/podcast-completion.page')
          .then(m => m.PodcastCompletionPage),
      },
      {
        path: 'stories',
        loadComponent: () =>
          import('./features/stories/pages/story-library/story-library.page').then(m => m.StoryLibraryPage),
      },
      {
        path: 'stories/platform/:id',
        loadComponent: () =>
          import('./features/stories/pages/platform-story-reader/platform-story-reader.page').then(m => m.PlatformStoryReaderPage),
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
      {
        path: 'settings/goals',
        loadComponent: () =>
          import('./features/settings/pages/study-goals/study-goals.page').then(m => m.StudyGoalsPage),
      },
      {
        path: 'settings/reminders',
        loadComponent: () =>
          import('./features/settings/pages/reminders/reminders.page').then(m => m.RemindersPage),
      },
      {
        path: 'settings/language',
        loadComponent: () =>
          import('./features/settings/pages/language/language.page').then(m => m.LanguagePage),
      },
      {
        path: 'admin/import',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/admin/pages/admin-import/admin-import.page').then(m => m.AdminImportPage),
      },
      {
        path: 'admin/import/v2',
        redirectTo: 'admin/import',
        pathMatch: 'full',
      },
      {
        path: 'admin/discount-codes',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/admin/pages/admin-discount-codes/admin-discount-codes.page').then(m => m.AdminDiscountCodesPage),
      },
      {
        path: 'admin/podcasts',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/admin/podcasts/pages/admin-podcast-topics/admin-podcast-topics.page')
            .then(m => m.AdminPodcastTopicsPage),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/sharing/sharing.routes').then(m => m.sharingRoutes),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
