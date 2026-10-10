import type { CefrLevel, LanguageCode } from '@lingua-card/shared/domain';
import type { PodcastTranscriptManifest } from './podcast-transcript-manifest';

export interface PodcastTranscriptPromptContext {
  topicTitle: string;
  topicDescription: string;
  targetLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  level: CefrLevel;
  vocabulary: readonly string[];
  direction?: string;
  manifest?: PodcastTranscriptManifest;
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
  let depth = 0;
  let separatorIndex = -1;
  for (let index = 0; index < rawItem.length; index += 1) {
    if (rawItem[index] === '(') depth += 1;
    if (rawItem[index] === ')') depth = Math.max(0, depth - 1);
    if (rawItem[index] === '=' && depth === 0) { separatorIndex = index; break; }
  }
  const suppliedText = separatorIndex >= 0
    ? rawItem.slice(0, separatorIndex)
    : rawItem;
  const suppliedTranslation = separatorIndex >= 0
    ? rawItem.slice(separatorIndex + 1).trim()
    : '';
  const headword = suppliedText
    .trim()
    .replace(/^[-*]\s+/u, '')
    .replace(/\s*\([^)]*\)/gu, '')
    .replace(/\s*\([^)]*$/gu, '')
    .split(',', 1)[0]
    .replace(/\|/gu, '')
    .replace(/^(?:der|die|das)\s+/iu, '')
    .trim();
  if (!headword) return '';
  return suppliedTranslation ? `${headword} = ${suppliedTranslation}` : headword;
}

export function buildPodcastTranscriptPrompt(context: PodcastTranscriptPromptContext): string {
  const vocabulary = context.manifest
    ? context.manifest.items.map(item => item.translation ? `${item.text} = ${item.translation}` : item.text)
    : normalizePodcastVocabulary(context.vocabulary);
  const vocabularyTarget = podcastVocabularyTarget(vocabulary.length);
  const hasExtendedVocabulary = vocabulary.length >= 15;
  const durationRequirement = hasExtendedVocabulary
    ? 'Aim for 3–5 minutes of spoken audio, with at least 3 minutes for 15 or more supplied vocabulary items. Let a larger vocabulary list justify more conversation, while keeping the episode under 5 minutes.'
    : 'Aim for a little over 2 minutes of spoken audio when fewer than 15 vocabulary items are supplied. Develop the scene enough to feel complete without stretching it to 3 minutes.';
  const dialogueRequirement = hasExtendedVocabulary
    ? 'Use about 26–36 concise turns. Give each required word a meaningful context, then revisit useful words in follow-up questions, answers, and reactions rather than listing definitions.'
    : 'Use about 18–26 concise turns. Include natural greetings, transitions, follow-up questions, reactions, and a closing.';
  const vocabularyList = context.manifest
    ? context.manifest.items.map(item => `- ${JSON.stringify({
      key: item.key,
      text: item.text,
      translation: item.translation ?? '',
      sourceContext: item.originalInput,
    })}`).join('\n')
    : vocabulary.length
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
${context.manifest
    ? `{"schemaVersion":2,"manifestId":"${context.manifest.id}","episode":{"title":"","titleTranslation":"","description":""},"speakers":[{"key":"host","name":"","voiceGender":"female"},{"key":"guest","name":"","voiceGender":"male"}],"turns":[{"speakerKey":"host","targetText":"","audioTags":[],"translation":"","vocabularyRefs":["linguacard-key"]}],"vocabulary":[{"key":"linguacard-key","text":"","translation":"","importance":"essential"}]}`
    : '{"schemaVersion":1,"episode":{"title":"","titleTranslation":"","description":""},"speakers":[{"key":"host","name":"","voiceGender":"female"},{"key":"guest","name":"","voiceGender":"male"}],"turns":[{"speakerKey":"host","targetText":"","audioTags":[],"translation":"","vocabularyRefs":["word-key"]}],"vocabulary":[{"key":"word-key","text":"","translation":"","importance":"essential"}]}' }

Requirements:
- Derive a concise natural episode title in the target language, its accurate translation, and a learner-facing description in the translation language.
- Use exactly two speakers with consistent female or male voiceGender values.
- Write a natural conversation appropriate for the CEFR level. ${durationRequirement}
- ${dialogueRequirement} Include a clear opening, a small development or change in the situation, and a natural closing so the dialogue feels complete rather than padded.
- Use most of the available dialogue budget: aim for ${hasExtendedVocabulary ? '1,750–1,850' : '1,650–1,800'} target-language characters across all targetText fields, with an absolute maximum of 2,000 characters. Count targetText plus rendered audioTags (each becomes [tag] followed by a space), not translations or JSON syntax. Keep the combined provider input at or below 2,000 characters.
- Before returning JSON, check the estimated spoken duration against the target above; revise short dialogue by adding relevant exchanges, not filler, while staying within the character limit.
- Keep the speaking pace natural for ${context.level} learners. Prefer short sentences, brief pauses implied by punctuation, and useful repetition in context.
- Make each reply respond to the preceding turn. Use believable questions, small hesitations and reactions, and a modest emotional arc. Keep clear articulation and an unhurried pace; do not add theatrical acting or overlapping speech.
- Add optional audioTags arrays to a few turns (roughly 4–8 across the episode), with at most two tags per turn. Allowed values: warm, curious, thoughtful, surprised, relieved, excited, chuckles, short pause. Choose cues appropriate to the scene; use short pause before a considered response and chuckles sparingly. These cues direct Eleven v4 and are not spoken words.
- Keep targetText and translation free of bracketed stage directions, SSML, speaker labels, and sound effects. Use punctuation for pauses within sentences. Write numbers and units as spoken words in targetText (for example, vierzig Quadratmeter), while preserving the vocabulary headword qm when supplied.
- Treat vocabulary supplied under Required vocabulary or elsewhere alongside this prompt as required input.
- Reduce dictionary notation to the headword before creating vocabulary entries: remove articles, plural endings, conjugation notes, grammar notes, example sentences, and separable-verb bars. For example, "neben (+ D.)" becomes "neben", "doch (Die Lampe ist doch toll!)" becomes "doch", "die Einweihungsfeier, -n" becomes "Einweihungsfeier", and "aus|sehen, er sieht aus, hat ausgesehen" becomes "aussehen".
- The vocabulary array must contain every supplied headword exactly once. Do not omit or replace any supplied headword.
- ${context.manifest
    ? 'Copy every supplied LinguaCard key and text exactly into vocabulary. Copy non-empty supplied translations exactly; fill in only blank translations.'
    : 'Create a unique lowercase kebab-case key for every vocabulary item.'}
- Use every supplied vocabulary item naturally in the dialogue, reference it from at least one turn, preserve any supplied translation exactly, and mark it essential.
- If an item has no translation, provide an accurate dictionary translation.
- ${vocabularyQuantityRequirement}
- Give every turn an accurate translation. Every speaker and vocabulary reference must resolve.
- Before returning JSON, verify that every supplied headword appears in the vocabulary array and has at least one matching vocabularyRefs entry.
- ${context.manifest ? `Return schemaVersion 2 and manifestId “${context.manifest.id}” exactly.` : 'Return schemaVersion 1.'}
- Use unique lowercase kebab-case keys. Do not include voice IDs or extra fields.`;
}

export function podcastVocabularyTarget(suppliedCount: number): number {
  if (suppliedCount > 15) return suppliedCount;
  if (suppliedCount >= 12) return 15;
  if (suppliedCount >= 5) return 12;
  return 8;
}

export function hasBalancedVocabularyParentheses(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === '(') depth++;
    if (character === ')' && --depth < 0) return false;
  }
  return depth === 0;
}
