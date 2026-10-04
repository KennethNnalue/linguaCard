import { effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { PodcastPlaybackJourney, PodcastRecommendation, PodcastClientEventName } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { VaultV2ApiService } from '../../vault/data-access/vault-v2-api.service';
import { VaultV2Store } from '../../vault/store/vault-v2.store';
import { PodcastDiscoveryEventsService } from '../services/podcast-discovery-events.service';

interface JourneyState {
  journey: PodcastPlaybackJourney | null;
  scope: string | null;
  catalogueEntry: string | null;
}
const initialState: JourneyState = { journey: null, scope: null, catalogueEntry: null };
export const PodcastJourneyStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(store => {
    const auth = inject(AuthService); const local = inject(LocalDataService);
    const contexts = inject(VaultV2ApiService); const events = inject(PodcastDiscoveryEventsService);
    let generation = 0;
    let selectionPending: Promise<void> = Promise.resolve();
    let startPending: Promise<void> = Promise.resolve();
    let startedJourneyId: string | null = null;
    async function scope(): Promise<string | null> {
      const userId = auth.currentUser()?.id;
      if (!userId) return null;
      try {
        const cached = !navigator.onLine ? await local.getVaultSnapshot(userId) : null;
        const context = cached?.vault.learningContext ?? await firstValueFrom(contexts.loadActiveContext());
        return auth.currentUser()?.id === userId ? `${userId}:${context.id}` : null;
      } catch { return null; }
    }
    async function persist(key: string, journey: PodcastPlaybackJourney): Promise<void> {
      try {
        await local.setPodcastJourney(`${key}:${journey.episodeId}`, journey);
        await local.setPodcastJourney(`${key}:journey:${journey.journeyId}`, journey);
      } catch { /* Listening remains available without durable telemetry context. */ }
    }
    function event(name: PodcastClientEventName, journey: PodcastPlaybackJourney): Promise<void> {
      return events.recordAndWait({ name, episodeId: journey.episodeId, journeyId: journey.journeyId,
        recommendationId: journey.recommendationId });
    }
    return {
      reset(): void { generation++; startedJourneyId = null; selectionPending = Promise.resolve(); startPending = Promise.resolve(); patchState(store, initialState); },
      catalogueEntrySelected(episodeId: string): void {
        generation++; startedJourneyId = null;
        patchState(store, { journey: null, catalogueEntry: episodeId });
      },
      async select(recommendation: PodcastRecommendation, preview: boolean): Promise<void> {
        const request = ++generation;
        const userId = auth.currentUser()?.id;
        const key = userId && recommendation.context?.learningContextId ? `${userId}:${recommendation.context.learningContextId}` : await scope();
        if (!key || generation !== request || auth.currentUser()?.id !== userId) return;
        const journey: PodcastPlaybackJourney = { journeyId: crypto.randomUUID(), episodeId: recommendation.episode.id,
          audioVersion: recommendation.context?.audioVersion ?? 1, recommendationId: recommendation.id, assisted: false };
        patchState(store, { journey, scope: key, catalogueEntry: null }); startedJourneyId = null;
        await persist(key, journey);
        if (generation !== request) return;
        selectionPending = event('recommendation_selected', journey);
        if (preview) selectionPending = selectionPending.then(() => auth.currentUser()?.id === userId ? event('preview_opened', journey) : undefined);
      },
      async restore(episodeId: string, audioVersion: number, preferredJourneyId?: string, replay = false): Promise<void> {
        const request = ++generation; const key = await scope();
        if (!key || request !== generation) return;
        const current = store.journey();
        if (!replay && store.catalogueEntry() !== episodeId && store.scope() === key && current?.episodeId === episodeId
          && current.audioVersion === audioVersion && (!preferredJourneyId || current.journeyId === preferredJourneyId)) return;
        let cached: PodcastPlaybackJourney | null = null;
        if (store.catalogueEntry() !== episodeId) {
          try { cached = await local.getPodcastJourney(preferredJourneyId ? `${key}:journey:${preferredJourneyId}` : `${key}:${episodeId}`); } catch { /* Recover as unattributed. */ }
        }
        if (request !== generation) return;
        const journey = cached?.episodeId === episodeId && cached.audioVersion === audioVersion && (!replay || cached.started !== true) ? cached
          : { journeyId: crypto.randomUUID(), episodeId, audioVersion, assisted: false };
        patchState(store, { journey, scope: key, catalogueEntry: null }); startedJourneyId = null;
        await persist(key, journey);
      },
      async reviewTransition(name: 'preparation_review_started' | 'preparation_review_returned'): Promise<void> {
        const journey = store.journey(); const key = store.scope();
        if (!journey || !key) return;
        const assisted = { ...journey, assisted: true };
        patchState(store, { journey: assisted }); await persist(key, assisted);
        const userId = auth.currentUser()?.id;
        selectionPending = selectionPending.then(() => auth.currentUser()?.id === userId ? event(name, assisted) : undefined);
      },
      started(episodeId: string, audioVersion: number): void {
        const request = generation;
        startPending = startPending.then(async () => {
          const key = await scope();
          if (!key || request !== generation) return;
          let journey = store.journey();
          if (store.scope() !== key || journey?.episodeId !== episodeId || journey.audioVersion !== audioVersion) {
            journey = { journeyId: crypto.randomUUID(), episodeId, audioVersion, assisted: false };
            patchState(store, { journey, scope: key, catalogueEntry: null }); await persist(key, journey);
          }
          if (startedJourneyId === journey.journeyId) return;
          startedJourneyId = journey.journeyId;
          const started = { ...journey, started: true };
          patchState(store, { journey: started }); await persist(key, started);
          await selectionPending;
          if (request === generation) await event('playback_started', started);
        });
      },
      async progressJourneyId(episodeId: string, audioVersion: number): Promise<string | undefined> {
        const captured = store.journey(); const request = generation;
        await startPending;
        const journey = captured ?? (generation === request ? store.journey() : null);
        return journey?.episodeId === episodeId && journey.audioVersion === audioVersion ? journey.journeyId : undefined;
      },
    };
  }),
  withHooks({ onInit(store) {
    const auth = inject(AuthService); const vault = inject(VaultV2Store);
    effect(() => { auth.currentUser(); vault.learningContextId(); untracked(() => store.reset()); });
  } }),
);
