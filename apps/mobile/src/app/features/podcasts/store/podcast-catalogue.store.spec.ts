import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PodcastEpisodeActivity, PodcastLibraryFeaturedEpisode, PodcastLibraryResponse, PodcastLibraryTopic } from '@lingua-card/shared/domain';
import { Subject, of } from 'rxjs';
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

  it('keeps a recent episode visible when suggestions fill the featured grid', async () => {
    const episode = (id: string): PodcastLibraryFeaturedEpisode => ({
      id, title: `Episode ${id}`, titleTranslation: `Translated ${id}`, level: 'A1',
      position: 0, durationMs: 60_000, focusVocabularyCount: 0, thumbnail,
      topicId: topic.id, topicTitle: topic.title, topicTitleTranslation: topic.titleTranslation,
    });
    const recent: PodcastEpisodeActivity = {
      episode: episode('played'), positionMs: 60_000, progressPercent: 100,
      status: 'completed', completedAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
    };
    const response: PodcastLibraryResponse = {
      topics: [topic], continueListening: null, recentEpisodes: [recent],
      suggestedEpisodes: Array.from({ length: 9 }, (_, index) => episode(`suggested-${index}`)),
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

    expect(store.featuredEpisodes()).toHaveLength(9);
    expect(store.featuredEpisodes().at(-1)?.episode.id).toBe('played');
    expect(store.featuredEpisodes().at(-1)?.source).toBe('recent');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Expected store transition did not complete');
}
