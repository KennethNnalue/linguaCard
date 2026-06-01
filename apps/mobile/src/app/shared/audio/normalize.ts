/** Must match the normalization logic in apps/api/src/word-audio/normalize.ts */
export function normalizeForAudio(text: string, _language: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:"""''()]+$/, '')
    .replace(/[.,!?;:"""''()]+(?=\s)/g, '');
}
