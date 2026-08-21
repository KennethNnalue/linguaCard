import { estimateReviewMinutes } from './estimate-review-time';

describe('estimateReviewMinutes', () => {
  it('uses mode and maturity-specific specification fallbacks', () => {
    expect(estimateReviewMinutes({ newCards: 10, reviewCards: 10, mode: 'type' })).toBe(8);
    expect(estimateReviewMinutes({ newCards: 10, reviewCards: 10, mode: 'flip' })).toBe(5);
  });

  it('clamps display estimates to a useful range', () => {
    expect(estimateReviewMinutes({ newCards: 0, reviewCards: 0, mode: 'flip' })).toBe(1);
    expect(estimateReviewMinutes({ newCards: 10_000, reviewCards: 0, mode: 'type' })).toBe(99);
  });
});
