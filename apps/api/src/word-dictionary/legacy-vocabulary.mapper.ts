import type { LegacyVocabularyProjectionInput } from '../vocabulary/models/vocabulary.types';
import type { WordDictionaryEntity } from './word-dictionary.entity';

export function legacyDictionaryEntryToProjectionInput(
  entity: WordDictionaryEntity,
): LegacyVocabularyProjectionInput {
  return {
    targetLanguage: entity.targetLang,
    sourceLanguage: entity.nativeLang,
    displayText: entity.displayText,
    article: entity.article,
    gender: entity.gender,
    translation: entity.translation,
    partOfSpeech: entity.wordType,
    phonetic: entity.phonetic,
    cefrLevel: entity.cefrLevel,
    plurals: entity.plurals,
    examples: entity.examples.map(example => ({
      target: example.target,
      source: example.native,
    })),
    synonyms: entity.synonyms.map(synonym => ({
      word: synonym.word,
      article: synonym.article,
      translation: synonym.translation,
      example: synonym.example,
      exampleNative: synonym.exampleNative,
    })),
    source: entity.source,
    model: entity.model,
  };
}
