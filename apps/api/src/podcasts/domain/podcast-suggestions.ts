import type { CefrLevel } from '@lingua-card/shared/domain';

const levelOrder: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export interface PodcastSuggestionCandidate {
  id: string;
  topicId: string;
  level: CefrLevel;
  publishedAt: Date | null;
}

export function selectPodcastSuggestions<T extends PodcastSuggestionCandidate>(
  episodes: readonly T[], selectedLevel: CefrLevel, listenedEpisodeIds: ReadonlySet<string>,
  limit = 9,
): T[] {
  const levelIndex = levelOrder.indexOf(selectedLevel);
  const remaining = episodes
    .filter(episode => !listenedEpisodeIds.has(episode.id))
    .sort((left, right) => {
      const levelDifference = Math.abs(levelOrder.indexOf(left.level) - levelIndex)
        - Math.abs(levelOrder.indexOf(right.level) - levelIndex);
      return levelDifference || (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0)
        || left.id.localeCompare(right.id);
    });
  const selected: T[] = [];
  const usedTopics = new Set<string>();
  while (remaining.length && selected.length < limit) {
    const bestLevelDistance = Math.abs(levelOrder.indexOf(remaining[0].level) - levelIndex);
    const variedIndex = remaining.findIndex(episode =>
      Math.abs(levelOrder.indexOf(episode.level) - levelIndex) === bestLevelDistance
      && !usedTopics.has(episode.topicId));
    const [next] = remaining.splice(variedIndex >= 0 ? variedIndex : 0, 1);
    selected.push(next);
    usedTopics.add(next.topicId);
  }
  return selected;
}
