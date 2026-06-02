import { Injectable } from '@nestjs/common';
import type { ImageImportRequest } from '@lingua-card/shared/domain';

@Injectable()
export class ImageExtractPromptBuilder {
  build(dto: ImageImportRequest): string {
    return `
You are a language extraction assistant.
Look at the attached image and identify ALL ${dto.targetLanguage} words or phrases visible.

Return a JSON array. Each element must have EXACTLY these two fields:

- "back": the bare word or phrase WITHOUT any grammatical article.
    CORRECT:   "Hund"       "Zeitung"     "Computer spielen"
    INCORRECT: "der Hund"   "die Zeitung" (if article is visible, strip it from back)
- "article": the grammatical article — exactly one of: "der", "die", "das", or null.
    Use null for verbs, adjectives, adverbs, and any word that has no article.
    "article" is the ONLY field that may hold the article.

Rules:
1. "back" must NEVER begin with "der", "die", or "das".
2. If the image shows "der Hund" → back: "Hund", article: "der"
3. If the image shows "laufen" → back: "laufen", article: null
4. Include plural form if visible after a comma, e.g. back: "Hund, -e"

Return ONLY the JSON array. No explanation. No markdown. No preamble.
Example: [{"back":"Hund, -e","article":"der"},{"back":"laufen","article":null}]
If no words are visible: []
`.trim();
  }
}
