import type { CefrLevel } from '@lingua-card/shared/domain';
import { selectPodcastSuggestions } from './podcast-suggestions';

function episode(id: string, topicId: string, level: CefrLevel, published: string) {
  return { id, topicId, level, publishedAt: new Date(published) };
}

describe('podcast suggestions', () => {
  it('returns only unplayed episodes at the selected level', () => {
    const episodes = [
      episode('c1', 'advanced', 'C1', '2026-09-13'),
      episode('a2', 'next', 'A2', '2026-09-11'),
      episode('a1-old', 'first', 'A1', '2026-09-01'),
      episode('a1-played', 'first', 'A1', '2026-09-12'),
    ];
    expect(selectPodcastSuggestions(episodes, 'A1', new Set(['a1-played'])).map(item => item.id))
      .toEqual(['a1-old']);
  });

  it('includes every level in All, ordered by publication date', () => {
    const episodes = [
      episode('a1', 'first', 'A1', '2026-09-11'),
      episode('b2', 'second', 'B2', '2026-09-13'),
      episode('c1', 'third', 'C1', '2026-09-12'),
    ];
    expect(selectPodcastSuggestions(episodes, 'all', new Set()).map(item => item.id))
      .toEqual(['b2', 'c1', 'a1']);
  });

  it('diversifies topics at the same level before repeating one', () => {
    const episodes = [
      episode('cafe-1', 'cafe', 'B1', '2026-09-13'),
      episode('cafe-2', 'cafe', 'B1', '2026-09-12'),
      episode('train-1', 'train', 'B1', '2026-09-11'),
    ];
    expect(selectPodcastSuggestions(episodes, 'B1', new Set(), 2).map(item => item.id))
      .toEqual(['cafe-1', 'train-1']);
  });
});
