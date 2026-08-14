import type { LearningStage, ScheduledCard } from '@lingua-card/shared/domain';

export function isNew(card: ScheduledCard): boolean {
  return card.reviewState.stage === 'new';
}

export function isDue(card: ScheduledCard, now: Date): boolean {
  const state = card.reviewState;
  return state.masterySource !== 'manual' && state.dueAt !== undefined
    && new Date(state.dueAt).getTime() <= now.getTime();
}

export function isMastered(card: ScheduledCard): boolean {
  return card.reviewState.stage === 'mastered' && card.reviewState.relearning === undefined;
}

export function isLeech(card: ScheduledCard): boolean {
  return card.reviewState.problemStatus === 'leech';
}

export function isStruggling(card: ScheduledCard): boolean {
  const state = card.reviewState;
  return state.problemStatus === 'leech'
    || (state.totalReviewCount > 0 && state.stage === 'learning');
}

export function lifecycleState(card: ScheduledCard): LearningStage {
  return card.reviewState.stage;
}

const STAGE_INDICATOR: Record<LearningStage, 0 | 1 | 2 | 3 | 5> = {
  new: 0, learning: 1, familiar: 2, strong: 3, mastered: 5,
};

export function stageIndicator(stage: LearningStage): 0 | 1 | 2 | 3 | 5 {
  return STAGE_INDICATOR[stage];
}
