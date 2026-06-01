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

For each word, return a JSON array. Each element must have:
- "back": the word EXACTLY as given above
- "front": the ${nativeLanguage} translation
- "article": "der", "die", "das", or null
- "categoryName": one of [${CATEGORIES.join(', ')}]
- "exampleTarget": a natural ${targetLanguage} sentence using this word
- "exampleNative": ${nativeLanguage} translation of that sentence
- "confidence": 1.0

Return ONLY the JSON array. No markdown. No extra text.
`.trim();
  }
}
