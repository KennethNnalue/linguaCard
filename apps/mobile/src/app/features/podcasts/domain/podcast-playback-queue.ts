import type { PodcastEpisodePlayer } from '@lingua-card/shared/domain';

export type PodcastRepeatMode = 'off' | 'episode' | 'topic';

export interface PodcastPlaybackOptions {
  repeatMode: PodcastRepeatMode;
  topicQueueEnabled: boolean;
  continueToNextTopic: boolean;
  playbackQueue: readonly string[];
}

export function resolvePodcastPlaybackTarget(
  episode: PodcastEpisodePlayer,
  options: PodcastPlaybackOptions,
): string | null {
  if (options.repeatMode === 'episode') return episode.id;
  if (!options.topicQueueEnabled) return null;
  if (options.playbackQueue.length) {
    const currentIndex = options.playbackQueue.indexOf(episode.id);
    const nextEpisodeId = currentIndex >= 0 ? options.playbackQueue[currentIndex + 1] : undefined;
    if (nextEpisodeId) return nextEpisodeId;
    if (options.repeatMode === 'topic') return options.playbackQueue[0] ?? null;
    return null;
  }
  if (episode.playbackContext.nextEpisodeId) return episode.playbackContext.nextEpisodeId;
  if (options.repeatMode === 'topic') return episode.playbackContext.firstEpisodeId;
  return options.continueToNextTopic
    ? episode.playbackContext.nextTopic?.firstEpisodeId ?? null
    : null;
}

export function shufflePodcastEpisodeIds(
  episodeIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...episodeIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled;
}
