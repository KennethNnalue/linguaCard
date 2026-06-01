import { createHash } from 'crypto';

export function normalizeForAudio(text: string, _language: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Strip trailing punctuation
    .replace(/[.,!?;:"""''()]+$/, '')
    // Strip punctuation before whitespace (mid-sentence)
    .replace(/[.,!?;:"""''()]+(?=\s)/g, '');
}

export function audioStorageHash(normalizedText: string, language: string): string {
  const input = `${language}:${normalizedText}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}
