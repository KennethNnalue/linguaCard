import { Injectable } from '@nestjs/common';
import type { ImageImportRequest } from '@lingua-card/shared/domain';

@Injectable()
export class ImageExtractPromptBuilder {
  build(dto: ImageImportRequest): string {
    return `
You are a language extraction assistant.
Look at the attached image and identify ALL ${dto.targetLanguage} words or phrases visible.

Return a JSON array. Each element must have ONLY these two fields:
- "back": the word or phrase EXACTLY as it appears (include article if visible, e.g. "der Hund")
- "article": "der", "die", "das", or null

Return ONLY the JSON array. No explanation. No markdown. No extra fields.
Example: [{"back": "der Hund", "article": "der"}, {"back": "laufen", "article": null}]
If no words are visible: []
`.trim();
  }
}
