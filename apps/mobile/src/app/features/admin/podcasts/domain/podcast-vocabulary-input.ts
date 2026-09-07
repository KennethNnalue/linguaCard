export interface PodcastVocabularyInput {
  episodeTitle: string | null;
  vocabulary: string[];
}

export function parsePodcastVocabularyInput(value: string): PodcastVocabularyInput {
  let episodeTitle: string | null = null;
  const vocabulary: string[] = [];

  for (const rawLine of value.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('```') || /^[[\]{}],?$/u.test(line)) continue;

    const heading = line.match(/^"([^"]+)"\s*:\s*\[$/u);
    if (heading) {
      episodeTitle = heading[1].trim() || null;
      continue;
    }

    const candidate = line.replace(/,$/u, '');
    if (candidate.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (typeof parsed === 'string' && parsed.trim()) vocabulary.push(parsed.trim());
        continue;
      } catch {
        vocabulary.push(candidate.replace(/^"|"$/gu, '').trim());
        continue;
      }
    }
    vocabulary.push(candidate);
  }

  return { episodeTitle, vocabulary };
}

export function podcastGenerationDirection(
  episodeTitle: string | null,
  direction: string,
): string | undefined {
  const instructions = direction.trim();
  const titleInstruction = episodeTitle
    ? `Use “${episodeTitle}” as the exact episode title.`
    : '';
  return [titleInstruction, instructions].filter(Boolean).join(' ') || undefined;
}
