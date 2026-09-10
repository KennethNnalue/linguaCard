
// ─── LOCAL-TIME DATE UTILITIES ────────────────────────────────────────────────

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalWeek(d: Date): Date {
  const copy = new Date(d);
  const dow = copy.getDay();
  const diffToMonday = (dow + 6) % 7;
  copy.setDate(copy.getDate() - diffToMonday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b);
}

// ─── ARTICLE HELPERS ──────────────────────────────────────────────────────────

export function articleCssClass(article: string | null | undefined): string {
  if (!article) return '';
  return `article--${article}`;
}

export function masteryCssClass(stage: string): string {
  return `mastery--${stage}`;
}

export function generateUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export const QUICK_WORD_LIST_MAX_ITEMS = 500;

export type QuickWordListValidation =
  | { valid: true }
  | {
      valid: false;
      code: 'enriched-json' | 'too-many-items';
      message: string;
    };

export function validateQuickWordList(words: readonly string[]): QuickWordListValidation {
  const normalizedWords = words.map(word => word.trim()).filter(Boolean);
  const preview = normalizedWords.slice(0, 30).join('\n');
  const startsLikeJson = normalizedWords[0] === '['
    || normalizedWords[0] === '{'
    || normalizedWords[0]?.startsWith('[{')
    || false;
  const containsEnrichedFields = /["'](?:back|front|article|examples|synonyms)["']\s*:/u.test(preview);

  if (startsLikeJson && containsEnrichedFields) {
    return {
      valid: false,
      code: 'enriched-json',
      message: 'This looks like enriched JSON. Use the Enriched JSON import instead.',
    };
  }

  if (normalizedWords.length > QUICK_WORD_LIST_MAX_ITEMS) {
    return {
      valid: false,
      code: 'too-many-items',
      message: `Quick word lists support at most ${QUICK_WORD_LIST_MAX_ITEMS} words.`,
    };
  }

  return { valid: true };
}
