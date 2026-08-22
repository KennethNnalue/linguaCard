
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
