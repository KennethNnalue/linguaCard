const LANGUAGE_ALIAS_TO_CANONICAL = new Map<string, string>([
  ['de-de', 'de'],
  ['en-us', 'en'],
  ['en-gb', 'en'],
  ['ar-sa', 'ar'],
]);

export function canonicalizeLanguageCode(language: string): string {
  const normalized = language.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) throw new Error('Language code is required');
  return LANGUAGE_ALIAS_TO_CANONICAL.get(normalized) ?? normalized;
}
