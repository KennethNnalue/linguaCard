import { normalizeForAudio } from './normalize';

export function audioCacheKey(text: string, language: string): string {
  const identity = `${language}:${normalizeForAudio(text, language)}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of identity) {
    const codePoint = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ codePoint, 0x01000193);
    second = Math.imul(second ^ codePoint, 0x85ebca6b);
  }
  const hash = `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  return `wa-${hash}`;
}

export function legacyAudioCacheKey(text: string, language: string): string {
  return `wa-${language}-${normalizeForAudio(text, language)}`;
}
