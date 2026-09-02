import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { OnboardingMotivation, OnboardingLevel, PlatformCollectionSummary } from '@lingua-card/shared/domain';
import { SUGGESTED_DAILY_GOAL } from '@lingua-card/shared/domain';
import { SettingsStore } from '../../settings/store/settings.store';
import { PlatformCollectionStore } from '../../vault/store/platform-collection.store';

interface OnboardingState {
  step: number;
  motivation: OnboardingMotivation | null;
  level: OnboardingLevel | null;
  recommendedCollection: PlatformCollectionSummary | null;
  isSeeding: boolean;
  seedError: string | null;
  seededCount: number;
}

const initial: OnboardingState = {
  step: 0,
  motivation: null,
  level: null,
  recommendedCollection: null,
  isSeeding: false,
  seedError: null,
  seededCount: 0,
};

const STEP_ROUTES = ['language', 'welcome', 'motivation', 'level', 'seed', 'goal'] as const;

export const OnboardingStore = signalStore(
  { providedIn: 'root' },
  withState(initial),

  withComputed(({ level }) => ({
    suggestedGoal: computed(() => {
      const l = level();
      return l ? SUGGESTED_DAILY_GOAL[l] : SUGGESTED_DAILY_GOAL.some;
    }),
    totalSteps: computed(() => STEP_ROUTES.length),
  })),

  withMethods((store) => {
    const settings = inject(SettingsStore);
    const platformStore = inject(PlatformCollectionStore);
    const router = inject(Router);

    const persistStep = async (step: number): Promise<void> => {
      await settings.update({ onboardingStep: step });
    };

    return {
      init(): void {
        const s = settings.settings();
        if (s) {
          patchState(store, {
            step: s.onboardingStep ?? 0,
            motivation: s.motivation,
            level: s.level,
          });
        }
      },

      setMotivation(motivation: OnboardingMotivation): void {
        patchState(store, { motivation });
        settings.update({ motivation });
      },

      setLevel(level: OnboardingLevel): void {
        patchState(store, { level });
        settings.update({ level });
      },

      next(): void {
        const nextStep = Math.min(store.step() + 1, STEP_ROUTES.length - 1);
        patchState(store, { step: nextStep });
        void persistStep(nextStep);
        void router.navigateByUrl(`/onboarding/${STEP_ROUTES[nextStep]}`);
      },

      back(): void {
        const prevStep = Math.max(store.step() - 1, 0);
        patchState(store, { step: prevStep });
        void router.navigateByUrl(`/onboarding/${STEP_ROUTES[prevStep]}`);
      },

      setRecommendedCollection(collection: PlatformCollectionSummary | null): void {
        patchState(store, { recommendedCollection: collection });
      },

      async adoptCollection(collectionId: string): Promise<void> {
        patchState(store, { isSeeding: true, seedError: null });

        const event = await platformStore.adoptAndWait(collectionId);
        if (event.type === 'success') {
          patchState(store, {
            isSeeding: false,
            seededCount: event.result.addedCount,
          });
        } else {
          patchState(store, { isSeeding: false, seedError: 'adopt_failed' });
        }
      },

      complete(dailyGoal?: number, remindersEnabled?: boolean): void {
        const goal = dailyGoal ?? store.suggestedGoal();
        void settings.update({
          dailyGoal: goal,
          remindersEnabled: remindersEnabled ?? false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          completeOnboarding: true,
        });
        void router.navigateByUrl('/home').then(() => {
          patchState(store, initial);
        });
      },

      skip(): void {
        void settings.update({ completeOnboarding: true });
        void router.navigateByUrl('/home').then(() => {
          patchState(store, initial);
        });
      },
    };
  }),
);
