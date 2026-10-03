import type { PodcastRecommendation, PodcastVocabularyFamiliarity, LearningStage } from '@lingua-card/shared/domain';

export interface RecommendationWord {
  lexemeId: string;
  text: string;
  translation: string;
  owned: boolean;
  mastery: LearningStage | null;
  reviewed: boolean;
}
export interface RecommendationCandidate {
  id: string;
  topicId: string;
  durationMs: number;
  words: readonly RecommendationWord[];
}
export function vocabularyFamiliarity(words: readonly RecommendationWord[]): PodcastVocabularyFamiliarity {
  const distinct = [...new Map(words.map(word => [word.lexemeId, word])).values()];
  return {
    total: distinct.length,
    familiar: distinct.filter(word => ['familiar', 'strong', 'mastered'].includes(word.mastery ?? '')).length,
    learning: distinct.filter(word => word.mastery === 'learning' || word.mastery === 'new' && word.owned).length,
    new: distinct.filter(word => !word.owned).length,
    unknown: distinct.filter(word => word.owned && word.mastery === null).length,
  };
}
export function rankPodcastRecommendations<T extends RecommendationCandidate>(candidates: readonly T[], limit: number): T[] {
  function priority(candidate: T): number[] {
    const words = [...new Map(candidate.words.map(word => [word.lexemeId, word])).values()];
    const known = words.filter(word => word.owned);
    const reviewed = known.filter(word => word.reviewed);
    const familiarity = vocabularyFamiliarity(words);
    const manageable = familiarity.total > 0 && familiarity.new / familiarity.total <= 0.5;
    return [manageable && reviewed.length >= 3 ? 1 : 0, manageable ? 1 : 0,
      reviewed.filter(word => word.mastery === 'learning' || word.mastery === 'familiar').length,
      reviewed.length, known.length, -candidate.durationMs];
  }
  const remaining = [...candidates].sort((left, right) => {
    const a = priority(left); const b = priority(right);
    for (let index = 0; index < a.length; index++) {
      if (a[index] !== b[index]) return b[index] - a[index];
    }
    return left.id.localeCompare(right.id);
  });
  const selected: T[] = [];
  const topics = new Set<string>();
  while (remaining.length && selected.length < limit) {
    const varied = remaining.findIndex(item => !topics.has(item.topicId));
    const [next] = remaining.splice(varied < 0 ? 0 : varied, 1);
    selected.push(next); topics.add(next.topicId);
  }
  return selected;
}
export function recommendationReason(words: readonly RecommendationWord[], session: boolean): PodcastRecommendation['reason'] {
  if (words.some(word => word.owned && word.reviewed)) return session ? 'session_words' : 'recent_words';
  return words.some(word => word.owned) ? 'vocabulary' : 'starter';
}
