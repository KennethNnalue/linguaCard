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
  const vocabularyTarget = podcastVocabularyTarget(vocabulary.length);
  const vocabularyList = vocabulary.length
    ? vocabulary.map(item => `- ${item}`).join('\n')
    : `- None supplied. Select ${vocabularyTarget} useful vocabulary items that fit the topic and CEFR level.`;
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
- Write a natural conversation appropriate for the CEFR level that is designed to produce at least 3 minutes of audio, aiming near the lower end of the 3–5 minute range.
- Use 18–26 concise turns and natural greetings, transitions, follow-up questions, reactions, and a closing so the dialogue feels complete rather than padded.
- Use most of the available dialogue budget: aim for 1,750–1,950 target-language characters in total, with an absolute maximum below 2,000 characters.
- Keep the speaking pace natural for ${context.level} learners. Prefer short sentences, brief pauses implied by punctuation, and useful repetition in context.
- Use every supplied vocabulary item naturally, preserve any supplied translation exactly, and mark supplied items essential.
- If an item has no translation, provide an accurate dictionary translation.
- Include ${vocabularyTarget} vocabulary items total. Add relevant supporting words at the same ${context.level} level when the supplied list is smaller than this target.
- Give every turn an accurate translation. Every speaker and vocabulary reference must resolve.
- Use unique lowercase kebab-case keys. Do not include voice IDs or extra fields.`;
}

export function podcastVocabularyTarget(suppliedCount: number): number {
  if (suppliedCount > 15) return suppliedCount;
  if (suppliedCount >= 12) return 15;
  if (suppliedCount >= 5) return 12;
  return 8;
}
