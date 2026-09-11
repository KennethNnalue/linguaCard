import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { EngagementStore } from '../../engagement/state/engagement.store';
import { SettingsStore } from '../../settings/store/settings.store';
import { CardStore } from '../../vault/store/card.store';
import { createReviewSession } from '../domain/review-domain';
import { serializeReviewSessionState } from '../domain/review-persistence';
import { CardAdministrationService } from '../services/card-administration.service';
import { ReviewAudioPreparationService } from '../services/review-audio-preparation.service';
import { ReviewCommitService } from '../services/review-commit.service';
import { ReviewLocalRepository } from '../services/review-local.repository';
import { ReviewPrefsService } from '../services/review-prefs.service';
import { ReviewSessionBuilderService } from '../services/review-session-builder.service';
import { ReviewStore } from './review.store';

describe('ReviewStore persisted active session', () => {
  it('restores an active session during startup history loading', async () => {
    const session = createReviewSession({
      id: 'persisted-session',
      source: { kind: 'daily' },
      mode: 'typing',
      direction: 'source_to_target',
      originalCardIds: ['card-1', 'card-2'],
      startedAt: new Date('2026-09-11T08:00:00.000Z'),
    });
    const localData = {
      getSessionHistory: jest.fn().mockResolvedValue([]),
      getActiveReviewSession: jest.fn().mockResolvedValue({
        session: serializeReviewSessionState(session),
        ratings: { 'card-1': 'good' },
        newCardCount: 1,
      }),
      clearActiveReviewSession: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        ReviewStore,
        { provide: CardStore, useValue: { cards: () => [] } },
        { provide: LocalDataService, useValue: localData },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
        { provide: SyncService, useValue: { enqueue: jest.fn() } },
        { provide: ReviewSessionBuilderService, useValue: {} },
        { provide: ReviewPrefsService, useValue: {} },
        { provide: ReviewCommitService, useValue: {} },
        {
          provide: ReviewLocalRepository,
          useValue: {
            committedEvents: jest.fn().mockResolvedValue([]),
            pendingCommits: jest.fn().mockResolvedValue([]),
            pendingAdministrations: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: EngagementStore, useValue: {} },
        { provide: CardAdministrationService, useValue: {} },
        { provide: SettingsStore, useValue: {} },
        { provide: ReviewAudioPreparationService, useValue: {} },
      ],
    });
    const store = TestBed.inject(ReviewStore);

    await store.loadHistory();

    expect(store.resumableSessionId()).toBe('persisted-session');
    expect(store.totalOriginalCount()).toBe(2);
    expect(store.sessionRatings()).toEqual({ 'card-1': 'good' });
    expect(localData.clearActiveReviewSession).not.toHaveBeenCalled();

    await expect(store.startSession({kind: 'daily'}, 20)).resolves.toEqual({kind: 'cancelled'});
    await expect(store.startSessionForCards(
      {kind: 'explicit', cardIds: ['other-card']},
      ['other-card'],
    )).resolves.toEqual({kind: 'cancelled'});
    expect(store.resumableSessionId()).toBe('persisted-session');
  });
});
