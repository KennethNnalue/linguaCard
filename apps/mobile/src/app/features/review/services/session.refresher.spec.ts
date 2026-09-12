import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LocalDataService } from '../../../core/services/local-data.service';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { ReviewStore } from '../store/review.store';
import { ReviewSessionApiService } from './review-session-api.service';
import { SessionRefresher } from './session.refresher';

describe('SessionRefresher', () => {
  it('refreshes synchronized history without reinitializing the active review session', async () => {
    const setPendingSessions = jest.fn().mockResolvedValue(undefined);
    const setSessionHistory = jest.fn().mockResolvedValue(undefined);
    const refreshHistory = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        SessionRefresher,
        {
          provide: ReviewSessionApiService,
          useValue: {
            findRecent: jest.fn().mockReturnValue(of([{
              id: 'session-1',
              deckId: 'deck-1',
              startedAt: '2026-09-11T07:00:00.000Z',
              completedAt: '2026-09-11T07:10:00.000Z',
              totalCards: 1,
              reviewedCards: 1,
              newCards: 0,
              ratings: {'card-1': 'good'},
            }])),
          },
        },
        {provide: LocalDataService, useValue: {setPendingSessions, setSessionHistory}},
        {provide: ReviewStore, useValue: {refreshHistory}},
        {
          provide: EngagementStore,
          useValue: {
            loadEngagement: jest.fn().mockResolvedValue(undefined),
            reconcileWithServer: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });

    await TestBed.inject(SessionRefresher).refresh('user-1');

    expect(setPendingSessions).toHaveBeenCalledWith('user-1', []);
    expect(setSessionHistory).toHaveBeenCalledWith('user-1', [{
      id: 'session-1',
      collectionId: null,
      collectionName: null,
      startedAt: '2026-09-11T07:00:00.000Z',
      completedAt: '2026-09-11T07:10:00.000Z',
      totalCards: 1,
      newCards: 0,
      ratings: {'card-1': 'good'},
      originalCardIds: ['card-1'],
      reviewedCardIds: ['card-1'],
      manuallyMasteredCardIds: [],
    }]);
    expect(refreshHistory).toHaveBeenCalledWith('user-1');
  });
});
