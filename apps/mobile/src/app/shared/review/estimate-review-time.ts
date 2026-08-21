export type ReviewEstimateMode = 'flip' | 'type';

export interface ReviewTimeEstimateInput {
  newCards: number;
  reviewCards: number;
  mode: ReviewEstimateMode;
}

/** Product fallbacks plus 6% interaction/transition overhead. */
export function estimateReviewMinutes(input: ReviewTimeEstimateInput): number {
  const newCards = Math.max(0, Math.trunc(input.newCards));
  const reviewCards = Math.max(0, Math.trunc(input.reviewCards));
  const seconds = input.mode === 'type'
    ? newCards * 28 + reviewCards * 18
    : newCards * 18 + reviewCards * 12;
  return Math.min(99, Math.max(1, Math.round((seconds * 1.06) / 60)));
}
