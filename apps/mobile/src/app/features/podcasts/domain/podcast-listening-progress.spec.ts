import { appendQualifyingPlaybackRange, qualifyingPlaybackDelta } from './podcast-listening-progress';

describe('qualifyingPlaybackDelta', () => {
  test('counts contiguous forward playback', () => {
    expect(qualifyingPlaybackDelta(10_000, 11_250, true)).toBe(1_250);
  });

  test('does not count pauses, rewinds, or forward seeks', () => {
    expect(qualifyingPlaybackDelta(10_000, 11_000, false)).toBe(0);
    expect(qualifyingPlaybackDelta(10_000, 9_000, true)).toBe(0);
    expect(qualifyingPlaybackDelta(10_000, 30_000, true)).toBe(0);
  });
});

describe('appendQualifyingPlaybackRange', () => {
  test('merges contiguous time updates into one range', () => {
    const first = appendQualifyingPlaybackRange([], 10_000, 11_000, true);
    expect(appendQualifyingPlaybackRange(first, 11_000, 12_000, true))
      .toEqual([{ startMs: 10_000, endMs: 12_000 }]);
  });

  test('keeps replayed ranges separate for server-side deduplication', () => {
    const first = appendQualifyingPlaybackRange([], 10_000, 11_000, true);
    expect(appendQualifyingPlaybackRange(first, 10_000, 11_000, true))
      .toEqual([
        { startMs: 10_000, endMs: 11_000 },
        { startMs: 10_000, endMs: 11_000 },
      ]);
  });
});
