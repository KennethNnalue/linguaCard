import type { PodcastEpisodePlayer } from '@lingua-card/shared/domain';
import { resolvePodcastPlaybackTarget, shufflePodcastEpisodeIds } from './podcast-playback-queue';

const noCustomQueue: readonly string[] = [];

function episode(
  nextEpisodeId: string | null,
  nextTopicFirstEpisodeId: string | null = null,
): PodcastEpisodePlayer {
  return {
    id: 'episode-2', topicId: 'topic-1', topicTitle: 'Topic', title: 'Episode',
    audioUrl: '/episode.mp3', audioDurationMs: 1_000, audioVersion: 1,
    thumbnail: {
      assetId: 'thumbnail-1', heroUrl: '/hero.webp', cardUrl: '/card.webp',
      heroWidth: 1, heroHeight: 1, cardWidth: 1, cardHeight: 1,
      focalPoint: { x: .5, y: .5 }, accessibilityDescription: 'Scene', version: 1,
    },
    speakers: [], turns: [], progress: null,
    playbackContext: {
      firstEpisodeId: 'episode-1', previousEpisodeId: 'episode-1', nextEpisodeId,
      nextTopic: nextTopicFirstEpisodeId
        ? { id: 'topic-2', title: 'Next topic', firstEpisodeId: nextTopicFirstEpisodeId }
        : null,
    },
  };
}

describe('podcast playback queue', () => {
  test('repeats the current episode before advancing', () => {
    expect(resolvePodcastPlaybackTarget(episode('episode-3'), {
      repeatMode: 'episode', topicQueueEnabled: true, continueToNextTopic: true,
      playbackQueue: noCustomQueue,
    })).toBe('episode-2');
  });

  test('advances through episodes in topic mode', () => {
    expect(resolvePodcastPlaybackTarget(episode('episode-3'), {
      repeatMode: 'off', topicQueueEnabled: true, continueToNextTopic: false,
      playbackQueue: noCustomQueue,
    })).toBe('episode-3');
  });

  test('restarts the topic after its final episode', () => {
    expect(resolvePodcastPlaybackTarget(episode(null), {
      repeatMode: 'topic', topicQueueEnabled: true, continueToNextTopic: false,
      playbackQueue: noCustomQueue,
    })).toBe('episode-1');
  });

  test('continues with the next topic when enabled', () => {
    expect(resolvePodcastPlaybackTarget(episode(null, 'next-topic-episode-1'), {
      repeatMode: 'off', topicQueueEnabled: true, continueToNextTopic: true,
      playbackQueue: noCustomQueue,
    })).toBe('next-topic-episode-1');
  });

  test('finishes after a standalone episode', () => {
    expect(resolvePodcastPlaybackTarget(episode('episode-3'), {
      repeatMode: 'off', topicQueueEnabled: false, continueToNextTopic: true,
      playbackQueue: noCustomQueue,
    })).toBeNull();
  });

  test('advances through an explicit shuffled queue', () => {
    expect(resolvePodcastPlaybackTarget(episode('episode-3'), {
      repeatMode: 'off', topicQueueEnabled: true, continueToNextTopic: false,
      playbackQueue: ['episode-2', 'episode-1', 'episode-3'],
    })).toBe('episode-1');
  });

  test('repeats an explicit queue from its first episode', () => {
    expect(resolvePodcastPlaybackTarget(episode('episode-3'), {
      repeatMode: 'topic', topicQueueEnabled: true, continueToNextTopic: false,
      playbackQueue: ['episode-1', 'episode-2'],
    })).toBe('episode-1');
  });
});

describe('shufflePodcastEpisodeIds', () => {
  test('returns a deterministic shuffled copy without mutating the source', () => {
    const episodeIds = ['episode-1', 'episode-2', 'episode-3'];
    const randomValues = [0, 0.5];
    let randomIndex = 0;

    expect(shufflePodcastEpisodeIds(episodeIds, () => randomValues[randomIndex++])).toEqual([
      'episode-3', 'episode-2', 'episode-1',
    ]);
    expect(episodeIds).toEqual(['episode-1', 'episode-2', 'episode-3']);
  });
});
