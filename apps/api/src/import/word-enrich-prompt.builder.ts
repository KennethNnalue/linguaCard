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
- "plural": for nouns, the FULL plural form INCLUDING the plural article, e.g. "die Flugzeuge".
    For non-nouns (verbs, adjectives, adverbs, phrases) use null.
    The plural article in German is always "die".
- "categoryName": one of [${CATEGORIES.join(', ')}]
- "exampleTarget": a natural ${targetLanguage} sentence using the word. Use the article correctly in the sentence.
- "exampleNative": ${nativeLanguage} translation of that sentence
- "synonyms": an array of 1–3 synonyms — words with similar or related meaning that a learner
    would benefit from knowing alongside this word. Include near-synonyms and words often used
    in similar contexts, even if not perfectly interchangeable.
    NOT antonyms, NOT random related words, NOT the headword itself.
    Aim for at least 1 synonym for nouns and verbs. Only return [] for highly specific proper
    nouns or technical jargon with genuinely no alternatives.
    Each synonym element has EXACTLY:
      - "word": the synonym in ${targetLanguage}, WITHOUT article
      - "article": "der"/"die"/"das"/null
      - "translation": ${nativeLanguage} translation of the synonym
      - "example": a natural ${targetLanguage} sentence using the synonym
      - "exampleNative": ${nativeLanguage} translation of that sentence
- "confidence": 1.0

SYNONYM GUIDANCE:
- Include near-synonyms freely. "Zustand" → "Lage" (situation), "Rucksack" → "Tasche" (bag).
- Good: "Flugzeug" → "Maschine" (aircraft), "Flieger" (plane, colloquial).
- Bad: "Flugzeug" → "Flughafen" (airport — completely different concept).
- Prefer common, learner-useful words over rare or archaic ones.
- Never list the headword itself as a synonym.

CRITICAL: If "back" is "Hund, -e" then "article" must be "der" — never prepend "der" to "back".

Return ONLY the JSON array. No markdown. No preamble. No extra fields.
`.trim();
  }
}
