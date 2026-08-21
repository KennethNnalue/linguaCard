export interface ReviewPlayerHeaderInput {
  currentPosition: number;
  totalCards: number;
}

export interface ReviewPlayerHeaderView {
  currentPosition: number;
  totalCards: number;
  remainingCards: number;
  progressPercent: number;
  checkpoints: readonly { positionPercent: number; reached: boolean }[];
}

const CHECKPOINT_COUNT = 5;

/** Projects domain/store values into the single header contract consumed by the UI. */
export function buildReviewPlayerHeader(input: ReviewPlayerHeaderInput): ReviewPlayerHeaderView {
  const totalCards = Math.max(0, Math.trunc(input.totalCards));
  const currentPosition = totalCards === 0
    ? 0
    : Math.min(totalCards, Math.max(1, Math.trunc(input.currentPosition)));
  const progressPercent = totalCards === 0 ? 0 : (currentPosition / totalCards) * 100;

  return {
    currentPosition,
    totalCards,
    remainingCards: Math.max(0, totalCards - currentPosition),
    progressPercent,
    checkpoints: Array.from({ length: CHECKPOINT_COUNT }, (_, index) => {
      const positionPercent = ((index + 1) / (CHECKPOINT_COUNT + 1)) * 100;
      return { positionPercent, reached: progressPercent >= positionPercent };
    }),
  };
}
