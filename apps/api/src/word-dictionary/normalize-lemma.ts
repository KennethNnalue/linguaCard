/**
 * Single canonical normalizer for audio keys, dictionary keys, vault dedup,
 * and within-batch dedup. All "same word" judgments in the platform use this.
 *
 * "der Apfel", "Der Apfel", "der apfel." → "der apfel"
 * "bestellen", "Bestellen!" → "bestellen"
 */
export function normalizeLemma(text: string, article?: string | null): string {
  const articlePrefix = article ? `${article.toLowerCase()} ` : '';
  const base = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:"""''()]+$/, '')
    .replace(/[.,!?;:"""''()]+(?=\s)/g, '');

  // If the base already starts with the article, don't double-prefix
  if (articlePrefix && base.startsWith(articlePrefix)) {
    return base;
  }
  return `${articlePrefix}${base}`.trim();
}
