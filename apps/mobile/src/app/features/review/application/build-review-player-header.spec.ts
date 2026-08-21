import { buildReviewPlayerHeader } from './build-review-player-header';

describe('buildReviewPlayerHeader', () => {
  it('projects session and daily-goal progress independently', () => {
    const view = buildReviewPlayerHeader({ currentPosition: 3, totalCards: 20 });
    expect(view).toMatchObject({ currentPosition: 3, totalCards: 20, remainingCards: 17, progressPercent: 15 });
    expect(view.checkpoints).toHaveLength(5);
  });

  it('clamps invalid and over-complete values for presentation', () => {
    const view = buildReviewPlayerHeader({ currentPosition: 99, totalCards: 3 });
    expect(view).toMatchObject({ currentPosition: 3, remainingCards: 0, progressPercent: 100 });
    expect(view.checkpoints.every(checkpoint => checkpoint.reached)).toBe(true);
  });
});
