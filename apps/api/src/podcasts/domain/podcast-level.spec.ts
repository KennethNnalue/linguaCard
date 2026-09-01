import { describe, expect, it } from '@jest/globals';
import { isPodcastEpisodeLevelValid, isPodcastLevelRangeValid } from './podcast-level';

describe('podcast CEFR levels', () => {
  it('accepts an episode level inside the topic range', () => {
    expect(isPodcastEpisodeLevelValid('A2', 'A1', 'B1')).toBe(true);
  });

  it('rejects episode levels outside the topic range', () => {
    expect(isPodcastEpisodeLevelValid('B2', 'A1', 'B1')).toBe(false);
  });

  it('rejects a topic range whose minimum exceeds its maximum', () => {
    expect(isPodcastLevelRangeValid('B1', 'A2')).toBe(false);
  });
});
