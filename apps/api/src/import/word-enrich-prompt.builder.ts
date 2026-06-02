import { Injectable } from '@nestjs/common';
import type { RawExtractedWord } from '@lingua-card/shared/domain';

const CATEGORIES = [
  'Food', 'Travel', 'Home', 'Work', 'People',
  'Nature', 'Transport', 'Shopping', 'Health', 'Other',
];

@Injectable()
export class WordEnrichPromptBuilder {
  build(words: RawExtractedWord[], targetLanguage: string, nativeLanguage: string): string {
    const wordList = words.map((w, i) => `${i + 1}. "${w.back}"`).join('\n');

    return `
You are a language learning assistant generating flashcard content.

WORDS TO ENRICH (${targetLanguage}):
${wordList}

For each word above, output a JSON array where each element has EXACTLY these fields:

- "back": copy the word EXACTLY as listed above. Do NOT add or prepend any article.
- "front": the ${nativeLanguage} translation of the bare word
- "article": the grammatical article — exactly one of "der", "die", "das", or null.
    Derive this from your own language knowledge. null for verbs, adjectives, adverbs, phrases.
    "back" must NEVER contain the article — "article" is the only field for it.
- "categoryName": one of [${CATEGORIES.join(', ')}]
- "exampleTarget": a natural ${targetLanguage} sentence using the word. Use the article correctly in the sentence.
- "exampleNative": ${nativeLanguage} translation of that sentence
- "confidence": 1.0

CRITICAL: If "back" is "Hund, -e" then "article" must be "der" — never prepend "der" to "back".

Return ONLY the JSON array. No markdown. No preamble. No extra fields.
`.trim();
  }
}
