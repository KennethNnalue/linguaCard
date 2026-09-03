import type { PlatformStoryKeyword, StoryKeyword } from '@lingua-card/shared/domain';

export function normalizePlatformStoryKeywords(
  storyId: string,
  keywords: readonly StoryKeyword[],
): PlatformStoryKeyword[] {
  return keywords.map((keyword, index) => {
    const existingWordId = 'wordId' in keyword ? keyword.wordId : null;
    return {
      ...keyword,
      wordId: typeof existingWordId === 'string' && existingWordId.length > 0
        ? existingWordId
        : `${storyId}:keyword:${index}`,
    };
  });
}
