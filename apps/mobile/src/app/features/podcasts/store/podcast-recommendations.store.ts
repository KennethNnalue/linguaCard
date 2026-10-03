import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { PodcastLibraryLevel, PodcastRecommendationPlacement, PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { VaultV2ApiService } from '../../vault/data-access/vault-v2-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { environment } from '../../../../environments/environment';

interface RecommendationState {
  response: PodcastRecommendationResponse | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  cached: boolean;
}
const initialState: RecommendationState = { response: null, status: 'idle', cached: false };
export const PodcastRecommendationsStore = signalStore(
  withState(initialState),
  withComputed(({ response }) => ({ recommendation: computed(() => response()?.recommendations[0] ?? null) })),
  withMethods(store => {
    const api = inject(PodcastApiService); const contexts = inject(VaultV2ApiService);
    const auth = inject(AuthService); const local = inject(LocalDataService); const reviews = inject(ReviewLocalRepository);
    let sequence = 0;
    return {
      async load(placement: PodcastRecommendationPlacement, level: PodcastLibraryLevel = 'all', sessionId?: string): Promise<void> {
        const request = ++sequence;
        const userId = auth.currentUser()?.id;
        patchState(store, { response: null, status: 'idle', cached: false });
        if (!userId || !environment.podcastRecommendationsEnabled) return;
        patchState(store, { status: 'loading' });
        let cacheKey: string | null = null;
        try {
          const snapshot = !navigator.onLine ? await local.getVaultSnapshot(userId) : null;
          const context = snapshot?.vault.learningContext ?? await firstValueFrom(contexts.loadActiveContext());
          if (sequence !== request || auth.currentUser()?.id !== userId) return;
          cacheKey = `${userId}:${context.id}:${level}:${placement}:${sessionId ?? 'recent'}`;
          try {
            const cached = await local.getPodcastRecommendations(cacheKey);
            if (sequence !== request || auth.currentUser()?.id !== userId) return;
            if (cached) patchState(store, { response: { ...cached, evidence: 'unavailable' }, status: 'success', cached: true });
          } catch { /* Recommendations remain optional when cache storage fails. */ }
          const response = await firstValueFrom(api.recommendations(placement, level, sessionId));
          const pending = await reviews.pendingCommits(userId);
          if (sequence !== request || auth.currentUser()?.id !== userId) return;
          const current = { ...response, evidence: pending.length ? 'pending_sync' : response.evidence } satisfies PodcastRecommendationResponse;
          patchState(store, { response: current, status: 'success', cached: false });
          try { await local.setPodcastRecommendations(cacheKey, current); } catch { /* Preserve the live result. */ }
        } catch {
          if (sequence === request) patchState(store, { status: store.response() ? 'success' : 'error' });
        }
      },
      reset(): void { sequence++; patchState(store, { response: null, status: 'idle', cached: false }); },
    };
  }),
);
