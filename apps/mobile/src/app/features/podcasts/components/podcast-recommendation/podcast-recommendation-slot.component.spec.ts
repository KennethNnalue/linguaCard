import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { PodcastRecommendation, PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { PodcastRecommendationSlotComponent } from './podcast-recommendation-slot.component';
import { PodcastRecommendationsStore } from '../../store/podcast-recommendations.store';
import { PodcastDiscoveryEventsService } from '../../services/podcast-discovery-events.service';
import { AuthService } from '../../../../core/services/auth.service';

function recommendation(id: string): PodcastRecommendation {
  return { id, policyVersion: 'vocabulary-v1', reason: 'vocabulary', matchCount: 1, matchedWords: [],
    familiarity: { total: 1, familiar: 1, learning: 0, new: 0, unknown: 0 },
    episode: { id, topicId: 'topic', topicTitle: 'Topic', topicTitleTranslation: '', title: 'Conversation', titleTranslation: '',
      level: 'A1', durationMs: 60000, position: 1, focusVocabularyCount: 1,
      thumbnail: { assetId: 'art', cardUrl: '', cardWidth: 640, cardHeight: 360, heroUrl: '', heroWidth: 1280, heroHeight: 720,
        accessibilityDescription: '', focalPoint: { x: .5, y: .5 }, version: 1 } } };
}
describe('bounded conversation discovery', () => {
  function setup() {
    const navigate = jest.fn(); const record = jest.fn();
    const response = signal<PodcastRecommendationResponse>({ evidence: 'current', recommendations: [recommendation('first'), recommendation('second')] });
    TestBed.configureTestingModule({ imports: [PodcastRecommendationSlotComponent], providers: [
      { provide: Router, useValue: { navigate } },
      { provide: PodcastDiscoveryEventsService, useValue: { record, revision: signal(0) } },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user' }) } },
    ] });
    TestBed.overrideComponent(PodcastRecommendationSlotComponent, { set: { template: '',
      providers: [{ provide: PodcastRecommendationsStore, useValue: { response, load: jest.fn() } }] } });
    const fixture = TestBed.createComponent(PodcastRecommendationSlotComponent);
    fixture.componentRef.setInput('placement', 'library');
    return { page: fixture.componentInstance, navigate, record };
  }
  it('limits initial discovery while allowing an explicit expansion', () => {
    const { page } = setup(); expect(page.items().map(item => item.id)).toEqual(['first']);
    page.expanded.set(true); expect(page.items().map(item => item.id)).toEqual(['first', 'second']);
  });
  it('carries a read-only preview intent to preparation', () => {
    const { page, navigate } = setup(); page.open(recommendation('first'), true);
    expect(navigate).toHaveBeenCalledWith(['/podcasts/episodes', 'first'], { queryParams: { preview: 'words' } });
  });
});
