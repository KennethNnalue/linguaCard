import { describe, expect, it } from '@jest/globals';
import { mergePodcastPlaybackRanges, podcastPlaybackRangeDuration } from '@lingua-card/shared/domain';
import {
  qualifiesPodcastCompletion,
  resolvePodcastProgressUpdate,
} from './podcast-learning-loop.service';

describe('resolvePodcastProgressUpdate', () => {
  const completionTime = new Date('2026-08-29T12:00:00.000Z');

  it('keeps completed progress at the episode duration when a late pause save arrives', () => {
    expect(resolvePodcastProgressUpdate(
      completionTime,
      120_000,
      75_000,
      false,
      new Date('2026-08-29T12:01:00.000Z'),
    )).toEqual({ positionMs: 120_000, completedAt: completionTime });
  });

  it('marks a first completion at the full episode duration', () => {
    expect(resolvePodcastProgressUpdate(
      null,
      120_000,
      119_000,
      true,
      completionTime,
    )).toEqual({ positionMs: 120_000, completedAt: completionTime });
  });

  it('clamps in-progress saves to the episode duration', () => {
    expect(resolvePodcastProgressUpdate(
      null,
      120_000,
      130_000,
      false,
      completionTime,
    )).toEqual({ positionMs: 120_000, completedAt: null });
  });
});

describe('qualifiesPodcastCompletion', () => {
  it('requires at least seventy percent of meaningful listening', () => {
    expect(qualifiesPodcastCompletion(83_999, 120_000)).toBe(false);
    expect(qualifiesPodcastCompletion(84_000, 120_000)).toBe(true);
  });

  it('never completes an episode without a valid duration', () => {
    expect(qualifiesPodcastCompletion(10_000, 0)).toBe(false);
  });
});

describe('podcast playback range accounting', () => {
  it('does not count overlapping or replayed audio twice', () => {
    const ranges = mergePodcastPlaybackRanges(
      [{ startMs: 0, endMs: 50_000 }],
      [{ startMs: 20_000, endMs: 60_000 }, { startMs: 0, endMs: 50_000 }],
      120_000,
    );

    expect(ranges).toEqual([{ startMs: 0, endMs: 60_000 }]);
    expect(podcastPlaybackRangeDuration(ranges)).toBe(60_000);
    expect(qualifiesPodcastCompletion(podcastPlaybackRangeDuration(ranges), 120_000)).toBe(false);
  });
});
