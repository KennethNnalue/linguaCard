import { podcastEpisodeExternalId, podcastExternalId } from './podcast-external-id';

describe('podcast external ids', () => {
  test('derives a stable slug from a human title', () => {
    expect(podcastExternalId('At the Café!')).toBe('at-the-cafe');
  });

  test('includes topic, sequence, and episode title', () => {
    expect(podcastEpisodeExternalId('at-the-cafe', 'Ordering a drink', 0))
      .toBe('at-the-cafe-01-ordering-a-drink');
  });
});
