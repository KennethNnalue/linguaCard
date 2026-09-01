import { describe, expect, it } from '@jest/globals';
import type { PodcastPlayerTurn } from '@lingua-card/shared/domain';
import { findPodcastTurnAtTime } from './podcast-playback';

function turn(id: string, startMs: number, endMs: number): PodcastPlayerTurn {
  return {
    id, speakerId: 'speaker-1', position: 0, targetText: id, translation: id,
    startMs, endMs, wordTimings: [],
  };
}

describe('findPodcastTurnAtTime', () => {
  const turns = [turn('first', 500, 1_500), turn('second', 2_000, 3_000)];

  it('shows the first turn while introductory audio is playing', () => {
    expect(findPodcastTurnAtTime(turns, 0)?.id).toBe('first');
  });

  it('keeps the previous turn visible during pauses between turns', () => {
    expect(findPodcastTurnAtTime(turns, 1_750)?.id).toBe('first');
  });

  it('keeps the final turn visible when playback reaches the end', () => {
    expect(findPodcastTurnAtTime(turns, 3_000)?.id).toBe('second');
  });

  it('returns null when the episode has no turns', () => {
    expect(findPodcastTurnAtTime([], 0)).toBeNull();
  });
});
