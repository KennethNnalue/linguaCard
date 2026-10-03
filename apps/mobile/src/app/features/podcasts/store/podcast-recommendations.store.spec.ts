import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import type { PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { PodcastRecommendationsStore } from './podcast-recommendations.store';
import { PodcastApiService } from '../data-access/podcast-api.service';
import { VaultV2ApiService } from '../../vault/data-access/vault-v2-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';

function setup(recommendations = jest.fn(() => of<PodcastRecommendationResponse>({ recommendations: [], evidence: 'current' }))) {
  const pendingCommits = jest.fn(async () => []);
  const local = { getPodcastRecommendations: jest.fn(async () => null), setPodcastRecommendations: jest.fn(async () => undefined) };
  TestBed.configureTestingModule({ providers: [PodcastRecommendationsStore,
    { provide: PodcastApiService, useValue: { recommendations } },
    { provide: VaultV2ApiService, useValue: { loadActiveContext: () => of({ id: 'en-de' }) } },
    { provide: AuthService, useValue: { currentUser: () => ({ id: 'user' }) } },
    { provide: LocalDataService, useValue: local },
    { provide: ReviewLocalRepository, useValue: { pendingCommits } },
  ] });
  return { store: TestBed.inject(PodcastRecommendationsStore), local, recommendations };
}
describe('optional podcast recommendations', () => {
  it('keeps failure local to recommendations', async () => {
    const { store } = setup(jest.fn(() => throwError(() => new Error('offline'))));
    await store.load('home');
    expect(store.status()).toBe('error'); expect(store.recommendation()).toBeNull();
  });
  it('uses a user/context/placement-specific cache key', async () => {
    const { store, local } = setup(); await store.load('review_summary', 'A2', 'session');
    expect(local.getPodcastRecommendations).toHaveBeenCalledWith('user:en-de:A2:review_summary:session');
    expect(store.response()?.evidence).toBe('current');
  });
  it('ignores a response after the feature has reset', async () => {
    const response = new Subject<PodcastRecommendationResponse>();
    let requested = false;
    const { store } = setup(jest.fn(() => { requested = true; return response; }));
    const loading = store.load('home');
    for (let index = 0; index < 10 && !requested; index++) await Promise.resolve();
    store.reset(); response.next({ recommendations: [], evidence: 'current' }); response.complete(); await loading;
    expect(store.status()).toBe('idle'); expect(store.response()).toBeNull();
  });
});
