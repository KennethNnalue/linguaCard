import { createNewReviewSchedulingState, type ScheduledCard } from '@lingua-card/shared/domain';
import { reviewAudioRequests } from './review-audio-preparation.service';

function card(): ScheduledCard {
  return {
    id: 'card-1',
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
    reviewState: createNewReviewSchedulingState('card-1'),
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
