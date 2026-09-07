import type { CefrLevel, LanguageCode } from '@lingua-card/shared/domain';

export interface PodcastTranscriptPromptContext {
  topicTitle: string;
  topicDescription: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  level: CefrLevel;
  vocabulary: readonly string[];
  direction?: string;
}

export function normalizePodcastVocabulary(vocabulary: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const rawItem of vocabulary) {
    const item = normalizePodcastVocabularyItem(rawItem);
    const key = item.split('=', 1)[0].trim().toLocaleLowerCase();
    if (item && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function normalizePodcastVocabularyItem(rawItem: string): string {
  const separatorIndex = rawItem.indexOf('=');
  const suppliedText = separatorIndex >= 0
    ? rawItem.slice(0, separatorIndex)
    : rawItem;
  const suppliedTranslation = separatorIndex >= 0
    ? rawItem.slice(separatorIndex + 1).trim()
    : '';
  const headword = suppliedText
    .trim()
    .replace(/^[-*]\s+/u, '')
    .split(',', 1)[0]
    .replace(/\s*\([^)]*\)/gu, '')
    .replace(/\|/gu, '')
    .replace(/^(?:der|die|das)\s+/iu, '')
    .trim();
  if (!headword) return '';
  return suppliedTranslation ? `${headword} = ${suppliedTranslation}` : headword;
}

export function buildPodcastTranscriptPrompt(context: PodcastTranscriptPromptContext): string {
  const vocabulary = normalizePodcastVocabulary(context.vocabulary);
  const vocabularyTarget = podcastVocabularyTarget(vocabulary.length);
  const vocabularyList = vocabulary.length
    ? vocabulary.map(item => `- ${item}`).join('\n')
    : '- None supplied by LinguaCard. Use a vocabulary list supplied alongside this prompt, if present.';
  const vocabularyHeading = vocabulary.length
    ? `Required vocabulary (${vocabulary.length} supplied; use every item and preserve supplied translations):`
    : 'Vocabulary input:';
  const vocabularyQuantityRequirement = vocabulary.length
    ? `Include ${vocabularyTarget} vocabulary items total. Add relevant supporting words at the same ${context.level} level when the supplied list is smaller than this target.`
    : `If no vocabulary list is supplied anywhere with this prompt, select 8 useful vocabulary items that fit the topic and ${context.level} level. If a list is supplied alongside this prompt, include every item from that list and add supporting words only when needed to reach 8 items.`;
  return `Create a complete LinguaCard language-learning podcast episode. Return valid JSON only, without Markdown fences or commentary.
Topic: ${context.topicTitle}
Topic description: ${context.topicDescription || 'No description supplied.'}
Target language: ${context.targetLanguage}
Translation language: ${context.translationLanguage}
CEFR level: ${context.level}
Creative direction: ${context.direction?.trim() || 'Infer a natural everyday scenario from the topic and vocabulary.'}
${vocabularyHeading}
${vocabularyList}

Schema:
{"schemaVersion":1,"episode":{"title":"","titleTranslation":"","description":""},"speakers":[{"key":"host","name":"","voiceGender":"female"},{"key":"guest","name":"","voiceGender":"male"}],"turns":[{"speakerKey":"host","targetText":"","translation":"","vocabularyRefs":["word-key"]}],"vocabulary":[{"key":"word-key","text":"","translation":"","importance":"essential"}]}

Requirements:
- Derive a concise natural episode title in the target language, its accurate translation, and a learner-facing description in the translation language.
- Use exactly two speakers with consistent female or male voiceGender values.
- Write a natural conversation appropriate for the CEFR level that is designed to produce at least 3 minutes of audio, aiming near the lower end of the 3–5 minute range.
- Use 18–26 concise turns and natural greetings, transitions, follow-up questions, reactions, and a closing so the dialogue feels complete rather than padded.
- Use most of the available dialogue budget: aim for 1,750–1,950 target-language characters in total, with an absolute maximum below 2,000 characters.
- Keep the speaking pace natural for ${context.level} learners. Prefer short sentences, brief pauses implied by punctuation, and useful repetition in context.
- Treat vocabulary supplied under Required vocabulary or elsewhere alongside this prompt as required input.
- Reduce dictionary notation to the headword before creating vocabulary entries: remove articles, plural endings, conjugation notes, grammar notes, example sentences, and separable-verb bars. For example, "neben (+ D.)" becomes "neben", "doch (Die Lampe ist doch toll!)" becomes "doch", "die Einweihungsfeier, -n" becomes "Einweihungsfeier", and "aus|sehen, er sieht aus, hat ausgesehen" becomes "aussehen".
- The vocabulary array must contain every supplied headword exactly once. Do not omit or replace any supplied headword.
- Use every supplied vocabulary item naturally in the dialogue, reference it from at least one turn, preserve any supplied translation exactly, and mark it essential.
- If an item has no translation, provide an accurate dictionary translation.
- ${vocabularyQuantityRequirement}
- Give every turn an accurate translation. Every speaker and vocabulary reference must resolve.
- Before returning JSON, verify that every supplied headword appears in the vocabulary array and has at least one matching vocabularyRefs entry.
- Use unique lowercase kebab-case keys. Do not include voice IDs or extra fields.`;
}

export function podcastVocabularyTarget(suppliedCount: number): number {
  if (suppliedCount > 15) return suppliedCount;
  if (suppliedCount >= 12) return 15;
  if (suppliedCount >= 5) return 12;
  return 8;
}
