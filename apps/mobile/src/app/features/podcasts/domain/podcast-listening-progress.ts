const MAX_CONTIGUOUS_PLAYBACK_DELTA_MS = 2_000;

export interface PodcastPlaybackRange {
  startMs: number;
  endMs: number;
}

export function qualifyingPlaybackDelta(
  previousPositionMs: number,
  currentPositionMs: number,
  isPlaying: boolean,
): number {
  const delta = currentPositionMs - previousPositionMs;
  if (!isPlaying || delta <= 0 || delta > MAX_CONTIGUOUS_PLAYBACK_DELTA_MS) return 0;
  return delta;
}

export function appendQualifyingPlaybackRange(
  ranges: readonly PodcastPlaybackRange[],
  previousPositionMs: number,
  currentPositionMs: number,
  isPlaying: boolean,
): readonly PodcastPlaybackRange[] {
  if (qualifyingPlaybackDelta(previousPositionMs, currentPositionMs, isPlaying) === 0) return ranges;
  const last = ranges[ranges.length - 1];
  if (last && Math.abs(last.endMs - previousPositionMs) <= 1) {
    return [...ranges.slice(0, -1), { startMs: last.startMs, endMs: currentPositionMs }];
  }
  return [...ranges, { startMs: previousPositionMs, endMs: currentPositionMs }];
}
