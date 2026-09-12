import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { createNewReviewSchedulingState, type ScheduledCard } from '@lingua-card/shared/domain';
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
import { ReviewSessionBuilderService } from '../services/review-session-builder.service';
import { ReviewStore } from './review.store';

function reviewCard(): ScheduledCard {
  return {
    id: 'card-1', deckId: 'deck-1', collectionId: null, userId: 'user-1', contextId: 'context-1',
    content: {
      front: 'invoice', back: 'Rechnung', article: 'die', gender: 'feminine', plural: null,
      examples: [], synonyms: [], notes: '', imageUrl: null, phonetic: null,
    },
    categoryIds: [], tags: [], createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z', version: 1,
    reviewState: createNewReviewSchedulingState('card-1'),
  };
}

describe('ReviewStore audio preparation', () => {
  it('does not resurrect a session closed while its audio is being prepared', async () => {
    let finishPreparation: () => void = () => undefined;
    const preparation = new Promise<void>(resolve => {
      finishPreparation = resolve;
    });
    const setActiveReviewSession = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ReviewStore,
        { provide: CardStore, useValue: { cards: () => [reviewCard()] } },
        { provide: LocalDataService, useValue: { setActiveReviewSession } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
        { provide: SyncService, useValue: {} },
        { provide: ReviewSessionBuilderService, useValue: {ensureCardsReady: jest.fn().mockResolvedValue(null)} },
        { provide: ReviewPrefsService, useValue: { mode: () => 'flip', dir: () => 'en-de' } },
        { provide: ReviewCommitService, useValue: {} },
        { provide: ReviewLocalRepository, useValue: {} },
        { provide: EngagementStore, useValue: {} },
        { provide: CardAdministrationService, useValue: {} },
        { provide: SettingsStore, useValue: {} },
        { provide: ReviewAudioPreparationService, useValue: { prepare: () => preparation } },
      ],
    });
    const store = TestBed.inject(ReviewStore);

    const starting = store.startSessionForCards(
      { kind: 'explicit', cardIds: ['card-1'] },
      ['card-1'],
    );
    store.leaveSession();
    finishPreparation();

    await expect(starting).resolves.toEqual({ kind: 'cancelled' });
    expect(store.operation()).toEqual({ kind: 'idle' });
    expect(store.presentation()).toBeNull();
    expect(setActiveReviewSession).not.toHaveBeenCalled();
  });

  it('keeps session card snapshots when background synchronization replaces the card store', async () => {
    const cards = signal<ScheduledCard[]>([reviewCard()]);
    TestBed.configureTestingModule({
      providers: [
        ReviewStore,
        {provide: CardStore, useValue: {cards, updateCard: jest.fn()}},
        {
          provide: LocalDataService,
          useValue: {setActiveReviewSession: jest.fn().mockResolvedValue(undefined)},
        },
        {provide: AuthService, useValue: {currentUser: () => ({id: 'user-1'})}},
        {provide: SyncService, useValue: {}},
        {provide: ReviewSessionBuilderService, useValue: {ensureCardsReady: jest.fn().mockResolvedValue(null)}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip', dir: () => 'en-de'}},
        {provide: ReviewCommitService, useValue: {}},
        {provide: ReviewLocalRepository, useValue: {}},
        {provide: EngagementStore, useValue: {}},
        {provide: CardAdministrationService, useValue: {}},
        {provide: SettingsStore, useValue: {}},
        {provide: ReviewAudioPreparationService, useValue: {prepare: jest.fn().mockResolvedValue(undefined)}},
      ],
    });
    const store = TestBed.inject(ReviewStore);

    await expect(store.startSessionForCards(
      {kind: 'explicit', cardIds: ['card-1']},
      ['card-1'],
    )).resolves.toMatchObject({kind: 'started'});
    expect(store.presentation()?.cardId).toBe('card-1');

    cards.set([]);

    expect(store.presentation()?.cardId).toBe('card-1');
    expect(store.sessionCards()).toEqual([reviewCard()]);
  });
});
