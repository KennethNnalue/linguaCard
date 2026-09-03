import type { AdminPodcastTopicListItem } from '@lingua-card/shared/domain';

export function nextEpisodeExternalId(topic: AdminPodcastTopicListItem): string {
  const existingIds = new Set(topic.episodes.map(episode => episode.externalId));
  let sequence = topic.episodes.length + 1;
  let candidate = episodeExternalId(topic.externalId, sequence);

  while (existingIds.has(candidate)) {
    sequence += 1;
    candidate = episodeExternalId(topic.externalId, sequence);
  }

  return candidate;
}

function episodeExternalId(topicExternalId: string, sequence: number): string {
  return `${topicExternalId}-${String(sequence).padStart(2, '0')}`;
}
