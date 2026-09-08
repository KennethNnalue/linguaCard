import { createHash } from 'node:crypto';
import type { AdminPodcastVocabularyAmbiguity, LanguageCode } from '@lingua-card/shared/domain';
import { normalizePodcastVocabulary, normalizePodcastVocabularyItem } from './podcast-transcript-prompt';

export interface PodcastTranscriptManifestItem {
  key: string;
  text: string;
  originalInput: string;
  translation: string | null;
  article: string | null;
  canonicalLexemeId: string | null;
}

export interface PodcastTranscriptManifest {
  id: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  items: PodcastTranscriptManifestItem[];
}

export interface PodcastTranscriptManifestPreparation {
  manifest: PodcastTranscriptManifest;
  ambiguities: AdminPodcastVocabularyAmbiguity[];
}

export function createPodcastTranscriptManifestDraft(
  vocabulary: readonly string[],
  targetLanguage: LanguageCode,
  translationLanguage: LanguageCode,
): PodcastTranscriptManifest {
  const normalized = normalizePodcastVocabulary(vocabulary);
  const usedKeys = new Set<string>();
  const items = normalized.map((item, index): PodcastTranscriptManifestItem => {
    const separatorIndex = item.indexOf('=');
    const text = normalizePodcastVocabularyItem(item).split('=', 1)[0].trim();
    const translation = separatorIndex >= 0 ? item.slice(separatorIndex + 1).trim() || null : null;
    const originalInput = findOriginalInput(vocabulary, text) ?? item;
    const article = targetLanguage === 'de'
      ? originalInput.trim().match(/^(der|die|das)\s+/iu)?.[1]?.toLocaleLowerCase('de') ?? null
      : null;
    const baseKey = vocabularyKey(text, index);
    const key = uniqueKey(baseKey, usedKeys);
    usedKeys.add(key);
    return { key, text, originalInput, translation, article, canonicalLexemeId: null };
  });
  return {
    id: manifestId(targetLanguage, translationLanguage, items),
    targetLanguage,
    translationLanguage,
    items,
  };
}

export function finalizePodcastTranscriptManifest(
  manifest: PodcastTranscriptManifest,
  items: PodcastTranscriptManifestItem[],
): PodcastTranscriptManifest {
  return {
    ...manifest,
    id: manifestId(manifest.targetLanguage, manifest.translationLanguage, items),
    items,
  };
}

function findOriginalInput(vocabulary: readonly string[], headword: string): string | null {
  for (const item of vocabulary) {
    if (normalizePodcastVocabularyItem(item).split('=', 1)[0].trim() === headword) return item;
  }
  return null;
}

function vocabularyKey(text: string, index: number): string {
  const key = text.normalize('NFC').toLocaleLowerCase()
    .replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/ß/gu, 'ss')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return key || `word-${index + 1}`;
}

function uniqueKey(baseKey: string, usedKeys: ReadonlySet<string>): string {
  if (!usedKeys.has(baseKey)) return baseKey;
  let suffix = 2;
  while (usedKeys.has(`${baseKey}-${suffix}`)) suffix += 1;
  return `${baseKey}-${suffix}`;
}

function manifestId(
  targetLanguage: LanguageCode,
  translationLanguage: LanguageCode,
  items: readonly PodcastTranscriptManifestItem[],
): string {
  return createHash('sha256').update(JSON.stringify({ targetLanguage, translationLanguage, items })).digest('hex');
}
