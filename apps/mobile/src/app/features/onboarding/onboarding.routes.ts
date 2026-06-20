import { Routes } from '@angular/router';

export const ONBOARDING_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'language',
    pathMatch: 'full',
  },
  {
    path: 'language',
    loadComponent: () =>
      import('./pages/language/language.page').then(m => m.LanguagePage),
  },
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome/welcome.page').then(m => m.WelcomePage),
  },
  {
    path: 'motivation',
    loadComponent: () =>
      import('./pages/motivation/motivation.page').then(m => m.MotivationPage),
  },
  {
    path: 'level',
    loadComponent: () =>
      import('./pages/level/level.page').then(m => m.LevelPage),
  },
  {
    path: 'seed',
    loadComponent: () =>
      import('./pages/seed/seed.page').then(m => m.SeedPage),
  },
  {
    path: 'goal',
    loadComponent: () =>
      import('./pages/goal-finish/goal-finish.page').then(m => m.GoalFinishPage),
  },
];
