import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import type { PlatformCollectionSummary, PodcastOnboardingExample } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { PodcastApiService } from '../../podcasts/data-access/podcast-api.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { PlatformCollectionStore } from '../../vault/store/platform-collection.store';
import { OnboardingStore } from './onboarding.store';
const collection: PlatformCollectionSummary = { id: 'set', title: 'Words', titleTranslation: 'Words', sourceLanguage: 'en',
  targetLanguage: 'de', coverSeed: 'set', coverImageUrl: null, emoji: null, level: 'A1', topic: 'Everyday', wordCount: 5,
  knownCount: 0, adoptionStatus: 'not-adopted', adoptedCollectionId: null };
const example: PodcastOnboardingExample = { episodeId: 'episode', episodeTitle: 'Conversation', episodeTitleTranslation: 'Conversation',
  lexemeId: 'place', word: 'Platz', translation: 'place', audioUrl: '/conversation.mp3', audioVersion: 2,
  transcriptText: 'Der Platz ist frei.', transcriptTranslation: 'The seat is free.', startMs: 3000, endMs: 6000 };
function setup() {
  const user = signal({ id: 'user' }); const request = jest.fn(() => of<PodcastOnboardingExample | null>(example));
  TestBed.configureTestingModule({ providers: [
    { provide: AuthService, useValue: { currentUser: user } },
    { provide: SettingsStore, useValue: { settings: () => null, update: jest.fn() } },
    { provide: Router, useValue: { navigateByUrl: jest.fn() } },
    { provide: PlatformCollectionStore, useValue: { adoptAndWait: async () => ({ type: 'success', result: { addedCount: 5 } }) } },
    { provide: PodcastApiService, useValue: { onboardingExample: request } },
  ] });
  const store = TestBed.inject(OnboardingStore); TestBed.flushEffects(); return { store, request, user };
}
describe('optional factual onboarding listening example', () => {
  it('shows a published shared-word example while adoption remains independently usable', async () => {
    const { store } = setup(); store.setRecommendedCollection(collection); await Promise.resolve();
    expect(store.listeningExample()?.word).toBe('Platz');
    await store.adoptCollection('set'); expect(store.seededCount()).toBe(5);
  });
  it('does not block adoption when no example or network is available', async () => {
    const { store, request } = setup(); request.mockReturnValueOnce(throwError(() => new Error('offline')));
    store.setRecommendedCollection(collection); await Promise.resolve();
    expect(store.listeningExample()).toBeNull(); await store.adoptCollection('set'); expect(store.seededCount()).toBe(5);
  });
  it('rejects a delayed example from an earlier account', async () => {
    const { store, request, user } = setup(); const delayed = new Subject<PodcastOnboardingExample | null>();
    request.mockReturnValueOnce(delayed); store.setRecommendedCollection(collection);
    user.set({ id: 'other' }); TestBed.flushEffects(); delayed.next(example); await Promise.resolve();
    expect(store.listeningExample()).toBeNull(); expect(store.recommendedCollection()).toBeNull();
  });
});
