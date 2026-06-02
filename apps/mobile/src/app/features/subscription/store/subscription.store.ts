import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';
import { SubscriptionApiService } from '../services/subscription-api.service';

interface SubscriptionState {
  status:    SubscriptionStatus | null;
  isLoading: boolean;
  error:     string | null;
}

const initialState: SubscriptionState = {
  status:    null,
  isLoading: false,
  error:     null,
};

export const SubscriptionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ status }) => ({
    tier:             computed(() => status()?.tier ?? 'free'),
    isPro:            computed(() => status()?.isActive ?? false),
    storiesRemaining: computed(() => status()?.storiesRemaining ?? 3),
    canGenerateStory: computed(() => {
      const s = status();
      if (!s) return true;
      if (s.isActive) return true;
      return (s.storiesRemaining ?? 0) > 0;
    }),
    imageImportsRemaining: computed(() => status()?.imageImportsRemaining ?? 3),
    canImportViaImage: computed(() => {
      const s = status();
      if (!s) return true;
      if (s.isActive) return true;
      return (s.imageImportsRemaining ?? 0) > 0;
    }),
  })),

  withMethods((store) => {
    const api = inject(SubscriptionApiService);
    return {
      loadStatus(): void {
        patchState(store, { isLoading: true, error: null });
        api.getMyStatus().subscribe({
          next:  (status) => patchState(store, { status, isLoading: false }),
          error: ()       => patchState(store, { isLoading: false, error: 'Failed to load subscription' }),
        });
      },
      onStoryGenerated(): void {
        const current = store.status();
        if (!current || current.isActive) return;
        patchState(store, {
          status: {
            ...current,
            storiesGenerated:  current.storiesGenerated + 1,
            storiesRemaining:  Math.max(0, (current.storiesRemaining ?? 0) - 1),
          },
        });
      },
      onImageImported(): void {
        const current = store.status();
        if (!current || current.isActive) return;
        patchState(store, {
          status: {
            ...current,
            imageImportsUsed:      current.imageImportsUsed + 1,
            imageImportsRemaining: Math.max(0, (current.imageImportsRemaining ?? 0) - 1),
          },
        });
      },
    };
  }),
);
