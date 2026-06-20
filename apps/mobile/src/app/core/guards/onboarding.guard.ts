import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SettingsStore } from '../../features/settings/store/settings.store';

const STEP_ROUTES: Record<number, string> = {
  0: 'language',
  1: 'welcome',
  2: 'motivation',
  3: 'level',
  4: 'seed',
  5: 'goal',
};

const ensureLoaded = async (): Promise<void> => {
  const settings = inject(SettingsStore);
  if (!settings.loaded()) {
    await settings.load();
  }
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const settings = inject(SettingsStore);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;

  await ensureLoaded();

  const s = settings.settings();
  if (s && s.onboardingCompletedAt !== null) return true;

  if (s && s.onboardingCompletedAt === null) {
    const step = s.onboardingStep ?? 0;
    return router.createUrlTree(['/onboarding', STEP_ROUTES[step] ?? 'language']);
  }

  return true;
};

export const onboardingCompleteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const settings = inject(SettingsStore);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);

  await ensureLoaded();

  const s = settings.settings();
  if (s && s.onboardingCompletedAt !== null) {
    return router.createUrlTree(['/home']);
  }

  return true;
};
