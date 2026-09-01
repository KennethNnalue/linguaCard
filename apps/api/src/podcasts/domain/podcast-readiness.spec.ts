import { describe, expect, it } from '@jest/globals';
import { calculatePodcastReadiness, podcastMasteryWeight } from './podcast-readiness';
import type { LearningStage } from '@lingua-card/shared/domain';

describe('podcast readiness', () => {
  it('uses the platform mastery weights', () => {
    const stages: LearningStage[] = ['new', 'learning', 'familiar', 'strong', 'mastered'];
    expect(stages.map(podcastMasteryWeight))
      .toEqual([0, 0.35, 0.7, 0.9, 1]);
  });

  it('recommends learning when readiness is below fifty percent', () => {
    expect(calculatePodcastReadiness([
      { mastery: 'new', importance: 'essential' },
      { mastery: 'learning', importance: 'essential' },
      { mastery: 'mastered', importance: 'supporting' },
    ])).toEqual({ percent: 45, recommendation: 'learn_first', learnFirstCount: 2 });
  });

  it('marks a learner ready at eighty percent', () => {
    expect(calculatePodcastReadiness([
      { mastery: 'familiar', importance: 'essential' },
      { mastery: 'strong', importance: 'supporting' },
    ])).toEqual({ percent: 80, recommendation: 'ready', learnFirstCount: 0 });
  });
});
