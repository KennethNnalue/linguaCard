import { createNewReviewSchedulingState, type CardView } from '@lingua-card/shared/domain';
import { describe, expect, it } from '@jest/globals';
import { canonicalCardToScheduledCard } from './canonical-card.mapper';

describe('canonicalCardToScheduledCard', () => {
  it('adapts the canonical learning item for existing review consumers', () => {
    const card: CardView = {
      id: 'item-1',
      learningContextId: 'context-1',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      lexeme: {
        id: 'lexeme-1',
        text: 'Haus',
        partOfSpeech: 'noun',
        grammar: { article: 'das', gender: 'neuter', plurals: ['Häuser'] },
        phonetic: null,
      },
      localization: { language: 'en', translation: 'house', definition: null },
      examples: [{ id: 'example-1', targetText: 'Das Haus ist groß.', sourceText: 'The house is big.' }],
      personalNote: 'Building',
      reviewState: createNewReviewSchedulingState('item-1'),
      collectionIds: ['collection-1'],
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    };

    expect(canonicalCardToScheduledCard('user-1', card)).toEqual(expect.objectContaining({
      id: 'item-1',
      userId: 'user-1',
      collectionId: 'collection-1',
      content: expect.objectContaining({
        front: 'house',
        back: 'Haus',
        article: 'das',
        gender: 'neuter',
        plural: 'Häuser',
        notes: 'Building',
      }),
    }));
  });
});
