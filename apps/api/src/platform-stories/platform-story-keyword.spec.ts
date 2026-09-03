import type { PlatformStoryKeyword, StoryKeyword } from '@lingua-card/shared/domain';
import { normalizePlatformStoryKeywords } from './platform-story-keyword';

const keyword: StoryKeyword = {
  cardId: null,
  german: 'das Haus',
  germanBase: 'Haus',
  translation: 'house',
  article: 'das',
  wordType: 'noun',
  level: 'A1',
};

describe('normalizePlatformStoryKeywords', () => {
  test('backfills a deterministic ID for a legacy keyword', () => {
    expect(normalizePlatformStoryKeywords('story-1', [keyword])).toEqual([
      { ...keyword, wordId: 'story-1:keyword:0' },
    ]);
  });

  test('preserves an existing canonical dictionary ID', () => {
    const canonicalKeyword: PlatformStoryKeyword = {
      ...keyword,
      wordId: 'dictionary-word-1',
    };
    const result = normalizePlatformStoryKeywords('story-1', [canonicalKeyword]);

    expect(result[0]?.wordId).toBe('dictionary-word-1');
  });
});
