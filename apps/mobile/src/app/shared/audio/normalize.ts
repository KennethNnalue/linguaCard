/** Must match the normalization logic in apps/api/src/word-audio/normalize.ts */
export function normalizeForAudio(text: string, language: string): string {
  void language;
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:"""''()]+$/, '')
    .replace(/[.,!?;:"""''()]+(?=\s)/g, '');
}
