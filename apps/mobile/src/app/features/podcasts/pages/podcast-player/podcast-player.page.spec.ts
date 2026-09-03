import { nextPodcastPlaybackSpeed } from './podcast-player.page';

describe('podcast playback speed', () => {
  it('cycles through the supported speeds', () => {
    expect(nextPodcastPlaybackSpeed(0.75)).toBe(1);
    expect(nextPodcastPlaybackSpeed(1)).toBe(1.25);
    expect(nextPodcastPlaybackSpeed(1.25)).toBe(1.5);
    expect(nextPodcastPlaybackSpeed(1.5)).toBe(0.75);
  });

  it('returns the first speed when the current value is unsupported', () => {
    expect(nextPodcastPlaybackSpeed(2)).toBe(0.75);
  });
});
