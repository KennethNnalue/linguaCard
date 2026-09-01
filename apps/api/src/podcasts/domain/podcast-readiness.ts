import type {
  PodcastReadinessRecommendation, PodcastVocabularyMastery,
} from '@lingua-card/shared/domain';

const MASTERY_WEIGHT: Readonly<Record<PodcastVocabularyMastery, number>> = {
  new: 0,
  learning: 0.35,
  familiar: 0.7,
  strong: 0.9,
  mastered: 1,
};

export interface PodcastReadinessInput {
  mastery: PodcastVocabularyMastery;
  importance: 'essential' | 'supporting';
}

export interface PodcastReadinessResult {
  percent: number;
  recommendation: PodcastReadinessRecommendation;
  learnFirstCount: number;
}

export function podcastMasteryWeight(mastery: PodcastVocabularyMastery): number {
  return MASTERY_WEIGHT[mastery];
}

export function calculatePodcastReadiness(
  vocabulary: readonly PodcastReadinessInput[],
): PodcastReadinessResult {
  if (!vocabulary.length) return { percent: 100, recommendation: 'ready', learnFirstCount: 0 };
  const readiness = vocabulary.reduce(
    (total, item) => total + podcastMasteryWeight(item.mastery), 0,
  ) / vocabulary.length;
  const percent = Math.round(readiness * 100);
  const recommendation: PodcastReadinessRecommendation = percent >= 80
    ? 'ready'
    : percent >= 50 ? 'review_first' : 'learn_first';
  const learnFirstCount = vocabulary.filter(
    item => item.importance === 'essential' && podcastMasteryWeight(item.mastery) < 0.7,
  ).length;
  return { percent, recommendation, learnFirstCount };
}
