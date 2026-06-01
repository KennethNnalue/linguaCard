import { Injectable } from '@nestjs/common';
import type { ImageImportRequest } from '@lingua-card/shared/domain';

const CATEGORIES = [
  'Food', 'Travel', 'Home', 'Work', 'People',
  'Nature', 'Transport', 'Shopping', 'Health', 'Other',
];

@Injectable()
export class ImageImportPromptBuilder {
  build(dto: ImageImportRequest): string {
    const isGerman = dto.targetLanguage === 'de';
    const articleConstraint = isGerman
      ? `- "article": "der", "die", "das", or null (null for verbs, adjectives, phrases — only nouns get an article)`
      : `- "article": null (article system not applicable for this language)`;

    return `
You are a language learning assistant that extracts vocabulary from images.
Analyse the attached image and identify all ${dto.targetLanguage} words or phrases visible.

For each word, return a JSON array. Each element must have exactly these fields:
- "back": the word exactly as it appears in the image (${dto.targetLanguage})
- "front": the ${dto.nativeLanguage} translation
${articleConstraint}
- "categoryName": one of [${CATEGORIES.join(', ')}]
- "exampleTarget": a natural ${dto.targetLanguage} sentence using this word in context
- "exampleNative": ${dto.nativeLanguage} translation of that sentence
- "confidence": float between 0.0 and 1.0 reflecting how clearly the word is visible

Return ONLY the JSON array. No explanation. No markdown code fences. No extra text before or after.
If no ${dto.targetLanguage} words are visible, return an empty array: []
`.trim();
  }
}
