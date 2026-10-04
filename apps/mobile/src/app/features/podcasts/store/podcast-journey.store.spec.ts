import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { PodcastPlaybackJourney, PodcastRecommendation } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { VaultV2ApiService } from '../../vault/data-access/vault-v2-api.service';
import { VaultV2Store } from '../../vault/store/vault-v2.store';
import { PodcastDiscoveryEventsService } from '../services/podcast-discovery-events.service';
import { PodcastJourneyStore } from './podcast-journey.store';

const recommendation: PodcastRecommendation = { id: 'issued', policyVersion: 'v2', reason: 'vocabulary', matchCount: 1,
  matchedWords: [], familiarity: { familiar: 0, learning: 1, new: 4, unknown: 0, total: 5 },
  context: { recommendationId: 'issued', episodeId: 'episode', audioVersion: 2, placement: 'home', policyVersion: 'v2',
    discoveryLevel: 'A1', targetLanguage: 'de', sourceLanguage: 'en', experimentVersion: 'test-v2', cohort: 'treatment' },
  episode: { id: 'episode', title: 'Conversation', titleTranslation: '', topicId: 'topic', topicTitle: '', topicTitleTranslation: '',
    level: 'A1', position: 1, durationMs: 120000, focusVocabularyCount: 5,
    thumbnail: { assetId: 'art', cardUrl: '', cardWidth: 1, cardHeight: 1, heroUrl: '', heroWidth: 1, heroHeight: 1,
      accessibilityDescription: '', focalPoint: { x: .5, y: .5 }, version: 1 } } };
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user' });
  const contextId = signal('de-en');
  const saved = new Map<string, PodcastPlaybackJourney>();
  const recordAndWait = jest.fn(async (): Promise<void> => undefined);
  TestBed.configureTestingModule({ providers: [
    { provide: AuthService, useValue: { currentUser: user } },
    { provide: VaultV2Store, useValue: { learningContextId: contextId } },
    { provide: VaultV2ApiService, useValue: { loadActiveContext: () => of({ id: contextId() }) } },
    { provide: LocalDataService, useValue: {
      getPodcastJourney: async (key: string) => saved.get(key) ?? null,
      setPodcastJourney: async (key: string, journey: PodcastPlaybackJourney) => { saved.set(key, journey); },
    } },
    { provide: PodcastDiscoveryEventsService, useValue: { recordAndWait } },
  ] });
  const store = TestBed.inject(PodcastJourneyStore); TestBed.flushEffects();
  return { store, user, contextId, saved, recordAndWait };
}
describe('same-device podcast attribution journey', () => {
  it('records preview as selection, survives restore/review and starts only when audio plays', async () => {
    const { store, recordAndWait } = setup();
    await store.select(recommendation, true);
    const first = store.journey();
    await waitFor(() => recordAndWait.mock.calls.length === 2);
    expect(recordAndWait).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'recommendation_selected', recommendationId: 'issued' }));
    expect(recordAndWait).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'preview_opened' }));
    await store.restore('episode', 2);
    await store.reviewTransition('preparation_review_started');
    expect(store.journey()?.journeyId).toBe(first?.journeyId);
    expect(store.journey()?.assisted).toBe(true);
    store.started('episode', 2);
    expect(await store.progressJourneyId('episode', 2)).toBe(first?.journeyId);
    expect(recordAndWait).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'playback_started', journeyId: first?.journeyId }));
    store.started('episode', 2); await store.progressJourneyId('episode', 2);
    expect(recordAndWait.mock.calls).toHaveLength(4);
  });
  it('scopes persistence by account and language and does not restore a replaced recording', async () => {
    const { store, user, contextId } = setup();
    await store.select(recommendation, false); const first = store.journey();
    store.reset(); await store.restore('episode', 2, first?.journeyId);
    expect(store.journey()?.recommendationId).toBe('issued');
    user.set({ id: 'other' }); TestBed.flushEffects();
    expect(store.journey()).toBeNull(); await store.restore('episode', 2);
    expect(store.journey()?.recommendationId).toBeUndefined();
    user.set({ id: 'user' }); contextId.set('fr-en'); TestBed.flushEffects(); await store.restore('episode', 2);
    expect(store.journey()?.recommendationId).toBeUndefined();
    contextId.set('de-en'); TestBed.flushEffects(); await store.restore('episode', 3);
    expect(store.journey()?.recommendationId).toBeUndefined(); expect(store.journey()?.audioVersion).toBe(3);
  });
  it('starts fresh unattributed journeys for explicit catalogue entry and replay', async () => {
    const { store } = setup();
    await store.select(recommendation, false); store.started('episode', 2);
    const original = await store.progressJourneyId('episode', 2);
    await store.restore('episode', 2, undefined, true);
    expect(store.journey()?.journeyId).not.toBe(original);
    expect(store.journey()?.recommendationId).toBeUndefined();
    await store.select(recommendation, false);
    const selected = store.journey()?.journeyId;
    await store.restore('episode', 2, undefined, true);
    expect(store.journey()?.journeyId).toBe(selected);
    store.catalogueEntrySelected('episode'); await store.restore('episode', 2);
    expect(store.journey()?.recommendationId).toBeUndefined();
  });
  it('keeps preview navigation independent of a slow telemetry response', async () => {
    const { store, recordAndWait } = setup();
    let release: (() => void) | undefined;
    recordAndWait.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await store.select(recommendation, true);
    expect(store.journey()?.recommendationId).toBe('issued');
    expect(recordAndWait.mock.calls).toHaveLength(1);
    release?.(); await waitFor(() => recordAndWait.mock.calls.length === 2);
  });

  it('keeps queued progress tied to the captured journey after a new selection', async () => {
    const { store, recordAndWait } = setup();
    await store.select(recommendation, false); const original = store.journey()?.journeyId;
    let release: (() => void) | undefined;
    recordAndWait.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    store.started('episode', 2);
    const pendingProgress = store.progressJourneyId('episode', 2);
    await waitFor(() => recordAndWait.mock.calls.length >= 2);
    await store.select(recommendation, false);
    expect(store.journey()?.journeyId).not.toBe(original);
    release?.();
    expect(await pendingProgress).toBe(original);
  });

});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) { if (predicate()) return; await Promise.resolve(); }
  throw new Error('Expected telemetry transition did not settle');
}
