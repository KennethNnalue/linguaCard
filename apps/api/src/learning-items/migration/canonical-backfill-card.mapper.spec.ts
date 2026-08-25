import { describe, expect, test } from '@jest/globals';
import type { CardContent } from '@lingua-card/shared/domain';
import { legacyCardToVocabularyProjection } from './canonical-backfill-card.mapper';

function content(overrides: Partial<CardContent> = {}): CardContent {
  return {
    front: 'Aeroplane',
    back: 'Flugzeug',
    article: 'das',
    gender: 'neuter',
    plural: 'die Flugzeuge',
    examples: [{ id: 'example-1', target: 'Das Flugzeug landet.', native: 'The aeroplane lands.' }],
    synonyms: [],
    notes: 'Travel word',
    imageUrl: null,
    phonetic: 'ˈfluːktsɔʏk',
    ...overrides,
  };
}

describe('legacyCardToVocabularyProjection', () => {
  test('preserves vocabulary content while assigning the legacy language context', () => {
    expect(legacyCardToVocabularyProjection(content())).toEqual(expect.objectContaining({
      targetLanguage: 'de',
      sourceLanguage: 'en',
      displayText: 'Flugzeug',
      translation: 'Aeroplane',
      article: 'das',
      gender: 'neuter',
      partOfSpeech: 'noun',
      plurals: ['die Flugzeuge'],
      examples: [{ target: 'Das Flugzeug landet.', source: 'The aeroplane lands.' }],
      source: 'migration',
    }));
  });

  test('uses the non-noun identity for cards without an article', () => {
    expect(legacyCardToVocabularyProjection(content({ article: null, gender: null, plural: null })).partOfSpeech)
      .toBe('other');
  });
});
