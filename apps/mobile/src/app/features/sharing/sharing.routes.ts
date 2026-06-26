import { Routes } from '@angular/router';

export const sharingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/notifications/notifications.page').then(m => m.NotificationsPage),
  },
];
