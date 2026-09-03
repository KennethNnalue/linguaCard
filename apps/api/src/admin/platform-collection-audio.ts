import type {WordAudioResolveRequest} from '@lingua-card/shared/domain';
import type {WordDictionaryEntity} from '../word-dictionary/word-dictionary.entity';
import {normalizeForAudio} from '../word-audio/normalize';

type AudioDictionaryEntry = Pick<
  WordDictionaryEntity,
  'article' | 'displayText' | 'translation' | 'examples' | 'targetLang' | 'nativeLang'
>;

function speechLocale(language: string): string {
  const locales: Readonly<Record<string, string>> = {
    de: 'de-DE',
    en: 'en-US',
    es: 'es-ES',
    ar: 'ar-SA',
  };
  return locales[language] ?? language;
}

export function platformCollectionAudioRequests(
  entries: readonly AudioDictionaryEntry[],
): WordAudioResolveRequest[] {
  const unique = new Map<string, WordAudioResolveRequest>();
  for (const entry of entries) {
    const targetLanguage = speechLocale(entry.targetLang);
    const headword = `${entry.article ? `${entry.article} ` : ''}${entry.displayText}`.trim();
    const firstExample = entry.examples[0];
    const candidates: WordAudioResolveRequest[] = [
      {text: headword, language: targetLanguage},
      ...(firstExample
        ? [{text: firstExample.target, language: targetLanguage}]
        : []),
    ];
    for (const candidate of candidates) {
      if (!candidate.text.trim()) continue;
      const language = candidate.language ?? targetLanguage;
      const key = `${language}:${normalizeForAudio(candidate.text, language)}`;
      if (!unique.has(key)) unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}
