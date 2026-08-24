import { describe, expect, it } from '@jest/globals';
import { WordDictionaryEntity } from './word-dictionary.entity';
import { legacyDictionaryEntryToProjectionInput } from './legacy-vocabulary.mapper';

function createLegacyEntry(): WordDictionaryEntity {
  const entity = new WordDictionaryEntity();
  entity.id = 'dictionary-1';
  entity.lemmaKey = 'der bahnhof';
  entity.targetLang = 'de-DE';
  entity.nativeLang = 'en';
  entity.displayText = 'Bahnhof';
  entity.article = 'der';
  entity.gender = 'masculine';
  entity.translation = 'train station';
  entity.wordType = 'noun';
  entity.phonetic = null;
  entity.cefrLevel = 'A1';
  entity.categoryName = 'Travel';
  entity.examples = [{ id: 'example-1', target: 'Wo ist der Bahnhof?', native: 'Where is the station?' }];
  entity.synonyms = [{
    word: 'Station', article: 'die', translation: 'station', example: '', exampleNative: '',
  }];
  entity.plurals = ['Bahnhöfe'];
  entity.wordAudioId = 'audio-1';
  entity.source = 'admin';
  entity.model = null;
  entity.enrichedAt = new Date('2026-01-01T00:00:00.000Z');
  entity.updatedAt = entity.enrichedAt;
  return entity;
}

describe('legacyDictionaryEntryToProjectionInput', () => {
  it('keeps lexical facts separate from source-language content', () => {
    expect(legacyDictionaryEntryToProjectionInput(createLegacyEntry())).toEqual({
      targetLanguage: 'de-DE',
      sourceLanguage: 'en',
      displayText: 'Bahnhof',
      article: 'der',
      gender: 'masculine',
      translation: 'train station',
      partOfSpeech: 'noun',
      phonetic: null,
      cefrLevel: 'A1',
      plurals: ['Bahnhöfe'],
      examples: [{ target: 'Wo ist der Bahnhof?', source: 'Where is the station?' }],
      synonyms: [{
        word: 'Station', article: 'die', translation: 'station', example: '', exampleNative: '',
      }],
      source: 'admin',
      model: null,
    });
  });
});
