import { PodcastJourneyStore } from '../../store/podcast-journey.store';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { PodcastPreparationPage } from './podcast-preparation.page';
import { PodcastCatalogueStore } from '../../store/podcast-catalogue.store';
import { PodcastDiscoveryEventsService } from '../../services/podcast-discovery-events.service';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { VaultV2Store } from '../../../vault/store/vault-v2.store';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';

describe('conversation preview handoff', () => {
  function setup(preview: boolean) {
    const route = { snapshot: { paramMap: convertToParamMap({ episodeId: 'episode' }),
      queryParamMap: convertToParamMap(preview ? { preview: 'words' } : {}) } };
    const available = signal(false);
    const store = { loadPreparation: jest.fn(), prepareSuggestedVocabulary: jest.fn(),
      essentialVocabulary: () => [], preparation: available };
    const record = jest.fn();
    TestBed.configureTestingModule({ imports: [PodcastPreparationPage], providers: [
      { provide: PodcastJourneyStore, useValue: { restore: jest.fn(async () => undefined), journey: signal(null), reviewTransition: jest.fn(async () => undefined) } },
      { provide: ActivatedRoute, useValue: route }, { provide: Router, useValue: { navigate: jest.fn() } },
      { provide: PodcastDiscoveryEventsService, useValue: { record } },
      ...[ReviewPlayerService, CardStore, CollectionStore, VaultV2Store, WordAudioService].map(provide => ({ provide, useValue: {} })),
    ] });
    TestBed.overrideComponent(PodcastPreparationPage, { set: {
      providers: [{ provide: PodcastCatalogueStore, useValue: store }],
      template: `@if (store.preparation() && wordsExpanded()) { <h2 #vocabularyHeading tabindex="-1">Focus words</h2> }`,
    } });
    const fixture = TestBed.createComponent(PodcastPreparationPage);
    return { fixture, page: fixture.componentInstance, store, route, available, record };
  }
  it('opens and focuses the requested preview when data arrives without saving words', async () => {
    const { page, fixture, available, store } = setup(true);
    page.ionViewWillEnter(); fixture.detectChanges();
    expect(page.wordsExpanded()).toBe(true);
    available.set(true); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toBe('Focus words');
    expect(store.prepareSuggestedVocabulary).not.toHaveBeenCalled();
    expect(store.loadPreparation).toHaveBeenCalledWith('episode');
  });
  it('returns normal entry to a compact preview on a reused Ionic page', () => {
    const { page, route, store } = setup(true);
    page.ionViewWillEnter(); page.allWordsShown.set(true);
    route.snapshot.queryParamMap = convertToParamMap({}); page.ionViewWillEnter();
    expect(page.wordsExpanded()).toBe(false); expect(page.allWordsShown()).toBe(false);
    expect(store.prepareSuggestedVocabulary).not.toHaveBeenCalled();
  });
});
