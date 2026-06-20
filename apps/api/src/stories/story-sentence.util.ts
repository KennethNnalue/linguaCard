import type { StorySentence } from '@lingua-card/shared/domain';

/**
 * Normalises stored story sentences before they leave the API.
 *
 * Legacy stories were persisted with the translation under an `english` key.
 * The multi-language epic renamed the schema field to `native`, but the JSONB
 * column data was never migrated — so old rows still carry `english` and the
 * reader's translation toggle had nothing to render. This backfills `native`
 * from the legacy `english` key so every consumer sees a consistent shape.
 */
export function normalizeStorySentences(sentences: unknown): StorySentence[] {
  if (!Array.isArray(sentences)) return [];
  return sentences.map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const native =
      typeof s['native'] === 'string' && s['native']
        ? (s['native'] as string)
        : typeof s['english'] === 'string'
          ? (s['english'] as string)
          : '';
    return {
      index: typeof s['index'] === 'number' ? (s['index'] as number) : i,
      german: typeof s['german'] === 'string' ? (s['german'] as string) : '',
      native,
      vocabWordIds: Array.isArray(s['vocabWordIds'])
        ? (s['vocabWordIds'] as string[])
        : [],
    };
  });
}

/**
 * Resolves the full native-language body, falling back to the joined sentence
 * translations when the stored `bodyNative` column is empty (legacy rows).
 */
export function resolveBodyNative(
  bodyNative: string | null | undefined,
  sentences: StorySentence[],
): string {
  if (bodyNative) return bodyNative;
  return sentences.map((s) => s.native).filter(Boolean).join(' ');
}
