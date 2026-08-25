import type { CardContent } from '@lingua-card/shared/domain';
import type { LegacyVocabularyProjectionInput } from '../../vocabulary/models/vocabulary.types';

export function legacyCardToVocabularyProjection(
  content: CardContent,
): LegacyVocabularyProjectionInput {
  return {
    targetLanguage: 'de',
    sourceLanguage: 'en',
    displayText: content.back,
    article: content.article,
    gender: content.gender,
    translation: content.front,
    definition: null,
    partOfSpeech: content.article ? 'noun' : 'other',
    phonetic: content.phonetic,
    cefrLevel: null,
    plurals: content.plural ? [content.plural] : [],
    examples: (content.examples ?? []).map(example => ({
      target: example.target,
      source: example.native,
    })),
    synonyms: (content.synonyms ?? []).map(synonym => ({ ...synonym })),
    source: 'migration',
    model: null,
  };
}
