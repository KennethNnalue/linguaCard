import { describe, expect, it } from '@jest/globals';
import { resolvePodcastProgressUpdate } from './podcast-learning-loop.service';

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
