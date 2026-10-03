import { rankPodcastRecommendations, recommendationReason, vocabularyFamiliarity, type RecommendationWord } from './podcast-recommendations';

function word(lexemeId: string, overrides: Partial<RecommendationWord> = {}): RecommendationWord {
  return { lexemeId, text: lexemeId, translation: lexemeId, owned: true, mastery: 'learning', reviewed: true, ...overrides };
}
function episode(id: string, words: RecommendationWord[], topicId = id, durationMs = 120000) {
  return { id, topicId, durationMs, words };
}
describe('vocabulary recommendations', () => {
  it('prioritizes a manageable conversation over more matches surrounded by unfamiliar words', () => {
    const useful = episode('useful', [word('a'), word('b'), word('c')]);
    const difficult = episode('difficult', [word('a'), word('b'), word('c'), word('d'),
      ...Array.from({ length: 10 }, (_, index) => word(`new-${index}`, { owned: false, mastery: null, reviewed: false }))]);
    expect(rankPodcastRecommendations([difficult, useful], 1)).toEqual([useful]);
  });
  it('counts canonical words once and distinguishes missing scheduling from unfamiliar vocabulary', () => {
    expect(vocabularyFamiliarity([word('a'), word('a'), word('b', { mastery: 'mastered' }),
      word('c', { mastery: null }), word('d', { owned: false, mastery: null })]))
      .toEqual({ total: 4, learning: 1, familiar: 1, new: 1, unknown: 1 });
  });
  it('does not call an editorial fallback a vocabulary match', () => {
    expect(recommendationReason([word('a', { owned: false, reviewed: false, mastery: null })], false)).toBe('starter');
    expect(recommendationReason([word('a', { reviewed: false })], false)).toBe('vocabulary');
    expect(recommendationReason([word('a')], true)).toBe('session_words');
  });
  it('diversifies topics, limits results and orders ties deterministically', () => {
    const a = episode('a', [word('a')], 'same');
    const b = episode('b', [word('a')], 'same');
    const c = episode('c', [word('a')], 'different');
    expect(rankPodcastRecommendations([c, b, a], 3).map(item => item.id)).toEqual(['a', 'c', 'b']);
    expect(rankPodcastRecommendations([], 1)).toEqual([]);
    expect(vocabularyFamiliarity([]).total).toBe(0);
  });
});
