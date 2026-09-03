import {createNewReviewSchedulingState, type CardView} from '@lingua-card/shared/domain';
import {learningItemAudioRequests} from './collection-audio-prefetch.service';

describe('learningItemAudioRequests', () => {
  it('prepares the spoken headword and every non-empty example', () => {
    const item = {
      id: 'item-1',
      learningContextId: 'context-1',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      lexeme: {
        id: 'lexeme-1',
        text: 'Rechnung',
        partOfSpeech: 'noun',
        grammar: {article: 'die'},
        phonetic: null,
      },
      localization: {language: 'en', translation: 'invoice', definition: null},
      examples: [
        {id: 'example-1', targetText: 'Die Rechnung, bitte.', sourceText: 'The bill, please.'},
        {id: 'example-2', targetText: '   ', sourceText: null},
      ],
      personalNote: '',
      reviewState: createNewReviewSchedulingState('item-1'),
      collectionIds: ['collection-1'],
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    } satisfies CardView;

    expect(learningItemAudioRequests([item], 'de-DE')).toEqual([
      {text: 'die Rechnung', language: 'de-DE'},
      {text: 'Die Rechnung, bitte.', language: 'de-DE'},
    ]);
  });
});
