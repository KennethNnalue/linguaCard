import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PodcastEpisodeActivity, PodcastEpisodePlayer, PodcastEpisodePreparation, PodcastLibraryFeaturedEpisode, PodcastLibraryResponse, PodcastLibraryTopic } from '@lingua-card/shared/domain';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { PodcastCatalogueStore } from './podcast-catalogue.store';

const thumbnail = {
  assetId: 'art', cardUrl: '/art.webp', cardWidth: 640, cardHeight: 360,
  heroUrl: '/art-large.webp', heroWidth: 1280, heroHeight: 720,
  accessibilityDescription: 'Conversation', focalPoint: { x: .5, y: .5 }, version: 1,
};

const topic: PodcastLibraryTopic = {
  id: 'topic-a2', title: 'Im Café', titleTranslation: 'At the café', description: '',
  targetLanguage: 'de', translationLanguage: 'en', minimumLevel: 'A2', maximumLevel: 'A2',
  episodeCount: 1, totalDurationMs: 60_000, thumbnail,
};

const transcriptEpisode: PodcastEpisodePlayer = {
  id: 'episode-1', topicId: topic.id, topicTitle: topic.title,
  topicTitleTranslation: topic.titleTranslation, title: 'A conversation',
  titleTranslation: 'A conversation', audioUrl: '/episode.mp3', audioDurationMs: 60_000,
  audioVersion: 1, thumbnail, speakers: [{ id: 'speaker-1', key: 'host', name: 'Mia' }],
  turns: [{ id: 'turn-1', speakerId: 'speaker-1', position: 0, targetText: 'Hallo!',
    translation: 'Hello!', startMs: 0, endMs: 1000, wordTimings: [] }],
  progress: null, playbackContext: {
    firstEpisodeId: 'episode-1', previousEpisodeId: null, nextEpisodeId: null, nextTopic: null,
  },
};

describe('PodcastCatalogueStore transcript preview', () => {
  it('shows a cached transcript before playback when the network is unavailable', async () => {
    const getPodcastPlayer = jest.fn(async () => transcriptEpisode);
    const getPlayer = jest.fn(() => throwError(() => new Error('Offline')));
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { getPlayer } },
      { provide: LocalDataService, useValue: { getPodcastPlayer } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'learner' }) } },
      { provide: SettingsStore, useValue: {} },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);

    store.loadTranscript('episode-1');
    await waitFor(() => store.transcriptStatus() === 'success');

    expect(store.transcriptEpisode()?.turns[0].targetText).toBe('Hallo!');
    expect(getPodcastPlayer).toHaveBeenCalledWith('learner', 'episode-1');
    expect(getPlayer).toHaveBeenCalledWith('episode-1');
  });
});

describe('PodcastCatalogueStore level selection', () => {
  afterEach(() => {
    localStorage.removeItem('lc_podcast_level');
    localStorage.removeItem('lc_explore_level');
  });

  it('uses the learner level and ignores stale responses after a level change', async () => {
    localStorage.removeItem('lc_podcast_level');
    localStorage.removeItem('lc_explore_level');
    const a2 = new Subject<PodcastLibraryResponse>();
    const b1 = new Subject<PodcastLibraryResponse>();
    const listTopics = jest.fn((level: string) => level === 'A2' ? a2 : b1);
    const getPodcastLibrary = jest.fn(async () => null);
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { listTopics } },
      { provide: LocalDataService, useValue: { getPodcastLibrary, setPodcastLibrary: jest.fn(async () => undefined) } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'learner' }) } },
      { provide: SettingsStore, useValue: { settings: signal({ level: 'some' }) } },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);

    store.loadTopics();
    await waitFor(() => listTopics.mock.calls.length === 1);
    expect(listTopics).toHaveBeenCalledWith('A2');
    store.selectLevel('B1');
    await waitFor(() => listTopics.mock.calls.length === 2);
    expect(getPodcastLibrary).toHaveBeenCalledWith('learner', 'B1');

    b1.next({ topics: [], continueListening: null, recentEpisodes: [], suggestedEpisodes: [] });
    b1.complete();
    await waitFor(() => store.status() === 'success');
    a2.next({ topics: [topic], continueListening: null, recentEpisodes: [], suggestedEpisodes: [] });
    a2.complete();
    await Promise.resolve();

    expect(store.selectedLevel()).toBe('B1');
    expect(store.topics()).toEqual([]);
  });

  it('uses an explicitly selected Explore CEFR level before the onboarding default', async () => {
    localStorage.setItem('lc_explore_level', 'B2');
    const listTopics = jest.fn(() => of({
      topics: [], continueListening: null, recentEpisodes: [], suggestedEpisodes: [],
    } satisfies PodcastLibraryResponse));
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { listTopics } },
      { provide: LocalDataService, useValue: { getPodcastLibrary: jest.fn(async () => null), setPodcastLibrary: jest.fn(async () => undefined) } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'learner' }) } },
      { provide: SettingsStore, useValue: { settings: signal({ level: 'beginner' }) } },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);

    store.loadTopics();
    await waitFor(() => store.status() === 'success');

    expect(store.selectedLevel()).toBe('B2');
    expect(listTopics).toHaveBeenCalledWith('B2');
  });

  it('places the three most recent listens first and fills up to ten with level picks', async () => {
    const episode = (id: string, level: PodcastLibraryFeaturedEpisode['level'] = 'A1'): PodcastLibraryFeaturedEpisode => ({
      id, title: `Episode ${id}`, titleTranslation: `Translated ${id}`, level,
      position: 0, durationMs: 60_000, focusVocabularyCount: 0, thumbnail,
      topicId: topic.id, topicTitle: topic.title, topicTitleTranslation: topic.titleTranslation,
    });
    const recent = (id: string, index: number): PodcastEpisodeActivity => ({
      episode: episode(id, 'B1'), positionMs: 60_000, progressPercent: 100,
      status: 'completed', completedAt: '2026-09-13T00:00:00.000Z',
      updatedAt: `2026-09-1${3 - index}T00:00:00.000Z`,
    });
    const response: PodcastLibraryResponse = {
      topics: [topic], continueListening: null,
      recentEpisodes: Array.from({ length: 4 }, (_, index) => recent(`played-${index}`, index)),
      suggestedEpisodes: [episode('wrong-level', 'B2'), ...Array.from({ length: 10 }, (_, index) => episode(`suggested-${index}`))],
    };
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { listTopics: () => of(response) } },
      { provide: LocalDataService, useValue: { getPodcastLibrary: jest.fn(async () => null), setPodcastLibrary: jest.fn(async () => undefined) } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'learner' }) } },
      { provide: SettingsStore, useValue: { settings: signal({ level: 'beginner' }) } },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);

    store.loadTopics();
    await waitFor(() => store.status() === 'success');

    expect(store.featuredEpisodes()).toHaveLength(10);
    expect(store.discoveryEpisodes().every(item => item.level === 'A1')).toBe(true);
    expect(store.discoveryEpisodes().some(item => item.id.startsWith('played'))).toBe(false);
    expect(store.completedEpisodes().every(item => item.status === 'completed')).toBe(true);
    expect(store.resumableEpisodes().every(item => item.status === 'in_progress')).toBe(true);
    expect(store.featuredEpisodes().slice(0, 3).map(item => item.episode.id))
      .toEqual(['played-0', 'played-1', 'played-2']);
    expect(store.featuredEpisodes().slice(3).every(item => item.episode.level === 'A1')).toBe(true);
    expect(store.featuredEpisodes().at(-1)?.episode.id).toBe('suggested-6');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Expected store transition did not complete');
}


describe('PodcastCatalogueStore preparation resilience', () => {
  const preparation: PodcastEpisodePreparation = {
    targetLanguage: 'de', translationLanguage: 'en',
    episode: { id: 'episode-1', topicId: topic.id, title: 'Conversation', titleTranslation: 'Conversation',
      topicTitle: topic.title, topicTitleTranslation: topic.titleTranslation, description: '', audioUrl: '/audio.mp3',
      level: 'A1', position: 1, durationMs: 60000, focusVocabularyCount: 0, thumbnail },
    readiness: { percent: 0, recommendation: 'learn_first', learnFirstCount: 0 },
    vocabulary: [], preparationCollectionId: null,
  };
  it('keeps API preparation usable when reading and writing cache fail', async () => {
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { getPreparation: () => of(preparation) } },
      { provide: LocalDataService, useValue: {
        getPodcastPreparation: async () => { throw new Error('Storage unavailable'); },
        setPodcastPreparation: async () => { throw new Error('Storage unavailable'); },
      } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'learner' }) } },
      { provide: SettingsStore, useValue: {} },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);
    store.loadPreparation('episode-1');
    await waitFor(() => store.status() === 'success');
    await Promise.resolve();
    expect(store.preparation()).toEqual(preparation);
    expect(store.error()).toBeNull();
  });
  it('ignores preparation requested before an account switch', async () => {
    const response = new Subject<PodcastEpisodePreparation>();
    const currentUser = signal({ id: 'learner' });
    let requested = false;
    const getPreparation = jest.fn(() => { requested = true; return response; });
    TestBed.configureTestingModule({ providers: [
      PodcastCatalogueStore,
      { provide: PodcastApiService, useValue: { getPreparation } },
      { provide: LocalDataService, useValue: { getPodcastPreparation: async () => null } },
      { provide: AuthService, useValue: { currentUser } },
      { provide: SettingsStore, useValue: {} },
    ] });
    const store = TestBed.inject(PodcastCatalogueStore);
    store.loadPreparation('episode-1');
    await waitFor(() => requested);
    expect(getPreparation).toHaveBeenCalledWith('episode-1');
    currentUser.set({ id: 'another-learner' });
    response.next(preparation); response.complete();
    await Promise.resolve();
    expect(store.preparation()).toBeNull();
  });
});
