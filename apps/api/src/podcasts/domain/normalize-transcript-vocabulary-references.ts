import type { AdminPodcastTranscriptPayload } from '@lingua-card/shared/domain';

export function normalizeTranscriptVocabularyReferences(
  payload: AdminPodcastTranscriptPayload,
): AdminPodcastTranscriptPayload {
  const keys = new Set(payload.vocabulary.map(item => item.key));
  const aliases = new Map<string, string[]>();
  for (const key of keys) {
    const alias = normalizeKey(key);
    aliases.set(alias, [...(aliases.get(alias) ?? []), key]);
  }
  return {
    ...payload,
    turns: payload.turns.map(turn => ({
      ...turn,
      vocabularyRefs: [...new Set(turn.vocabularyRefs.flatMap(reference => {
        if (keys.has(reference)) return [reference];
        const matches = aliases.get(normalizeKey(reference)) ?? [];
        if (matches.length === 1) return matches;
        // Keep ambiguous links for validation; unlisted words have no learning item to link.
        return matches.length > 1 ? [reference] : [];
      }))],
    })),
  };
}

function normalizeKey(value: string): string {
  return value.normalize('NFC').trim().toLowerCase()
    .replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/ß/gu, 'ss');
}
