import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { SettingsStore } from '../../settings/store/settings.store';
import { CardStore } from '../../vault/store/card.store';
import { CardAdministrationService } from '../services/card-administration.service';
import { ReviewAudioPreparationService } from '../services/review-audio-preparation.service';
import { ReviewCommitService } from '../services/review-commit.service';
import { ReviewLocalRepository } from '../services/review-local.repository';
import { ReviewPrefsService } from '../services/review-prefs.service';
import { ReviewSessionApiService } from '../services/review-session-api.service';
import { ReviewSessionBuilderService } from '../services/review-session-builder.service';
import { ReviewStore } from './review.store';

describe('ReviewStore clearHistory', () => {
  const history = [{
    id: 'session-1',
    startedAt: '2026-09-11T07:00:00.000Z',
    completedAt: '2026-09-11T07:10:00.000Z',
    totalCards: 1,
    newCards: 0,
    collectionId: null,
    collectionName: null,
    ratings: { 'card-1': 'good' },
    reviewedCardIds: ['card-1'],
  }];

  const localData = {
    getSessionHistory: jest.fn(),
    setSessionHistory: jest.fn(),
    setPendingSessions: jest.fn(),
  };
  const clearOnServer = jest.fn();
  let store: InstanceType<typeof ReviewStore>;

  beforeEach(async () => {
    localData.getSessionHistory.mockReset().mockResolvedValue(history);
    localData.setSessionHistory.mockReset().mockResolvedValue(undefined);
    localData.setPendingSessions.mockReset().mockResolvedValue(undefined);
    clearOnServer.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        ReviewStore,
        { provide: CardStore, useValue: { cards: () => [] } },
        { provide: LocalDataService, useValue: localData },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
        { provide: SyncService, useValue: {} },
        { provide: ReviewSessionBuilderService, useValue: {} },
        { provide: ReviewPrefsService, useValue: {} },
        { provide: ReviewCommitService, useValue: {} },
        { provide: ReviewLocalRepository, useValue: {} },
        { provide: EngagementStore, useValue: {} },
        { provide: CardAdministrationService, useValue: {} },
        { provide: SettingsStore, useValue: {} },
        { provide: ReviewAudioPreparationService, useValue: {} },
        { provide: ReviewSessionApiService, useValue: { clearHistory: clearOnServer } },
      ],
    });
    store = TestBed.inject(ReviewStore);
    await store.refreshHistory('user-1');
  });

  it('clears account and device session history after server success', async () => {
    expect(store.sessionHistory()).toHaveLength(1);
    await store.clearHistory();
    expect(clearOnServer).toHaveBeenCalled();
    expect(localData.setPendingSessions).toHaveBeenCalledWith('user-1', []);
    expect(localData.setSessionHistory).toHaveBeenCalledWith('user-1', []);
    expect(store.sessionHistory()).toEqual([]);
  });

  it('keeps history when the server cannot clear it', async () => {
    clearOnServer.mockReturnValue(throwError(() => new Error('offline')));
    await expect(store.clearHistory()).rejects.toThrow('offline');
    expect(localData.setSessionHistory).not.toHaveBeenCalled();
    expect(store.sessionHistory()).toHaveLength(1);
  });
});
