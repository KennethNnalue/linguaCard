export function transcriptContainsHeadword(text: string, headword: string): boolean {
  const normalized = headword.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
    .test(text.normalize('NFKC').replace(/\s+/gu, ' '));
}
