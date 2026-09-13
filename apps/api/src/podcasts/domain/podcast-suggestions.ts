import type { CefrLevel, PodcastLibraryLevel } from '@lingua-card/shared/domain';

export interface PodcastSuggestionCandidate {
  id: string;
  topicId: string;
  level: CefrLevel;
  publishedAt: Date | null;
}

export function selectPodcastSuggestions<T extends PodcastSuggestionCandidate>(
  episodes: readonly T[], selectedLevel: PodcastLibraryLevel, listenedEpisodeIds: ReadonlySet<string>,
  limit = 10,
): T[] {
  const remaining = episodes
    .filter(episode => !listenedEpisodeIds.has(episode.id) && (selectedLevel === 'all' || episode.level === selectedLevel))
    .sort((left, right) => {
      return (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0)
        || left.id.localeCompare(right.id);
    });
  const selected: T[] = [];
  const usedTopics = new Set<string>();
  while (remaining.length && selected.length < limit) {
    const variedIndex = remaining.findIndex(episode =>
      !usedTopics.has(episode.topicId));
    const [next] = remaining.splice(variedIndex >= 0 ? variedIndex : 0, 1);
    selected.push(next);
    usedTopics.add(next.topicId);
  }
  return selected;
}
