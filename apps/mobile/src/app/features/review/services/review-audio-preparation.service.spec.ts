import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createNewReviewSchedulingState, type ScheduledCard } from '@lingua-card/shared/domain';
import { AuthService } from '../../../core/services/auth.service';
import { NetworkService } from '../../../core/services/network.service';
import { SettingsStore } from '../../settings/store/settings.store';
import { WordAudioService } from '../../../shared/audio/word-audio.service';
import { CardStore } from '../../vault/store/card.store';
import {
  ReviewAudioPreparationService,
  reviewAudioRequests,
} from './review-audio-preparation.service';
import { ReviewPrefsService } from './review-prefs.service';
import { ReviewSessionBuilderService } from './review-session-builder.service';

function card(id = 'card-1'): ScheduledCard {
  return {
    id,
    deckId: 'deck-1',
    collectionId: null,
    userId: 'user-1',
    contextId: 'context-1',
    content: {
      front: 'invoice',
      back: 'Rechnung',
      article: 'die',
      gender: 'feminine',
      plural: 'die Rechnungen',
      examples: [
        { id: 'example-1', target: 'Die Rechnung, bitte.', native: 'The bill, please.' },
        { id: 'example-2', target: '   ', native: '' },
      ],
      synonyms: [
        { word: 'Abrechnung', article: 'die', translation: 'statement', example: 'Ich prüfe die Abrechnung.', exampleNative: 'I check the statement.' },
      ],
      notes: '',
      imageUrl: null,
      phonetic: null,
    },
    categoryIds: [],
    tags: [],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    version: 1,
    reviewState: createNewReviewSchedulingState(id),
  };
}

describe('reviewAudioRequests', () => {
  it('prepares the spoken headword and every playable example', () => {
    expect(reviewAudioRequests([card()])).toEqual([
      { text: 'die Rechnung', language: 'de-DE' },
      { text: 'Die Rechnung, bitte.', language: 'de-DE' },
      { text: 'Ich prüfe die Abrechnung.', language: 'de-DE' },
    ]);
  });
});

describe('ReviewAudioPreparationService background preparation', () => {
  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  function configure(options: {
    cards: readonly ScheduledCard[];
    selectedCardIds: readonly string[];
    preWarm: jest.Mock;
    online?: boolean;
  }): ReviewAudioPreparationService {
    const cards = signal(options.cards);
    const isOnline = signal(options.online ?? true);
    const settings = signal({ dailyGoal: 2, timezone: 'Europe/Berlin' });
    TestBed.configureTestingModule({
      providers: [
        ReviewAudioPreparationService,
        {provide: CardStore, useValue: {cards}},
        {provide: NetworkService, useValue: {isOnline}},
        {provide: WordAudioService, useValue: {preWarm: options.preWarm}},
        {provide: SettingsStore, useValue: {dailyGoal: () => settings().dailyGoal, settings}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip', dir: () => 'en-de'}},
        {provide: AuthService, useValue: {currentUser: () => ({id: 'user-1'})}},
        {
          provide: ReviewSessionBuilderService,
          useValue: {select: jest.fn().mockResolvedValue({kind: 'selected', cardIds: options.selectedCardIds})},
        },
      ],
    });
    return TestBed.inject(ReviewAudioPreparationService);
  }

  it('warms only the cards selected by the real daily-session policy', async () => {
    const due = card('due');
    const retention = {
      ...card('retention'),
      content: {...card('retention').content, back: 'Bestand'},
    };
    const excludedNew = {
      ...card('excluded-new'),
      content: {...card('excluded-new').content, back: 'Ausgeschlossen'},
    };
    const preWarm = jest.fn().mockResolvedValue({
      requestedCount: 6,
      availableCount: 6,
      savedOfflineCount: 6,
      failedRequests: [],
    });
    const service = configure({
      cards: [due, retention, excludedNew],
      selectedCardIds: ['due', 'retention'],
      preWarm,
    });

    service.initialize();
    TestBed.tick();
    await flushPromises();

    expect(preWarm).toHaveBeenCalledTimes(1);
    const requests = preWarm.mock.calls[0][0] as Array<{text: string}>;
    expect(requests.some(request => request.text.includes('Bestand'))).toBe(true);
    expect(requests.some(request => request.text.includes('Ausgeschlossen'))).toBe(false);
  });

  it('retries only failed clips online without waiting for another signal change', async () => {
    jest.useFakeTimers();
    const failedRequest = {text: 'Die Rechnung, bitte.', language: 'de-DE'};
    const preWarm = jest.fn()
      .mockResolvedValueOnce({
        requestedCount: 3,
        availableCount: 2,
        savedOfflineCount: 2,
        failedRequests: [failedRequest],
      })
      .mockResolvedValueOnce({
        requestedCount: 1,
        availableCount: 1,
        savedOfflineCount: 1,
        failedRequests: [],
      });
    const service = configure({cards: [card()], selectedCardIds: ['card-1'], preWarm});

    service.initialize();
    TestBed.tick();
    await flushPromises();

    expect(preWarm).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(preWarm).toHaveBeenCalledTimes(2);
    expect(preWarm).toHaveBeenLastCalledWith([failedRequest]);
    jest.useRealTimers();
  });
});
