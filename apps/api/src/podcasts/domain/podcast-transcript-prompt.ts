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
    const item = rawItem.trim();
    const key = item.toLocaleLowerCase();
    if (item && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function buildPodcastTranscriptPrompt(context: PodcastTranscriptPromptContext): string {
  const vocabulary = normalizePodcastVocabulary(context.vocabulary);
  const vocabularyList = vocabulary.length
    ? vocabulary.map(item => `- ${item}`).join('\n')
    : '- None supplied. Select 8–15 useful vocabulary items that fit the topic and CEFR level.';
  return `Create a complete LinguaCard language-learning podcast episode. Return valid JSON only, without Markdown fences or commentary.
Topic: ${context.topicTitle}
Topic description: ${context.topicDescription || 'No description supplied.'}
Target language: ${context.targetLanguage}
Translation language: ${context.translationLanguage}
CEFR level: ${context.level}
Creative direction: ${context.direction?.trim() || 'Infer a natural everyday scenario from the topic and vocabulary.'}
Required vocabulary (preserve supplied translations):
${vocabularyList}

Schema:
{"schemaVersion":1,"episode":{"title":"","titleTranslation":"","description":""},"speakers":[{"key":"host","name":"","voiceGender":"female"},{"key":"guest","name":"","voiceGender":"male"}],"turns":[{"speakerKey":"host","targetText":"","translation":"","vocabularyRefs":["word-key"]}],"vocabulary":[{"key":"word-key","text":"","translation":"","importance":"essential"}]}

Requirements:
- Derive a concise natural episode title in the target language, its accurate translation, and a learner-facing description in the translation language.
- Use exactly two speakers with consistent female or male voiceGender values.
- Write a natural conversation appropriate for the CEFR level and keep all target-language dialogue below 2,000 characters.
- Use every supplied vocabulary item naturally, preserve any supplied translation exactly, and mark supplied items essential.
- If an item has no translation, provide an accurate dictionary translation.
- Include 8–15 vocabulary items total, adding only relevant supporting items when fewer than 8 are supplied.
- Give every turn an accurate translation. Every speaker and vocabulary reference must resolve.
- Use unique lowercase kebab-case keys. Do not include voice IDs or extra fields.`;
}
