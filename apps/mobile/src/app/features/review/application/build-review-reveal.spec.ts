import { buildReviewReveal } from './build-review-reveal';
import type { TypedAnswerFeedback } from '../services/answer-evaluator.service';

const feedback = (overrides: Partial<TypedAnswerFeedback>): TypedAnswerFeedback => ({
  outcome: 'correct', tint: 'correct', correctArticle: 'der', userArticle: 'der', articleWrong: false,
  youChars: [], typedRaw: 'der Verband', ...overrides,
});

describe('buildReviewReveal', () => {
  it('uses the article—not correctness—to select the answer surface', () => {
    expect(buildReviewReveal('der', feedback({ outcome: 'correct' })).answerSurface).toBe('der');
    expect(buildReviewReveal('der', feedback({ outcome: 'gender', tint: 'close', userArticle: 'die', articleWrong: true })).answerSurface).toBe('der');
  });

  it('uses the neutral app surface when a card has no article', () => {
    expect(buildReviewReveal(null, feedback({ outcome: 'wrong', tint: 'wrong' })).answerSurface).toBe('neutral');
  });

  it('keeps correct status compact by omitting the submitted attempt', () => {
    expect(buildReviewReveal('die', feedback({ outcome: 'correct' })).verdict).toMatchObject({
      verdictKey: 'review.type.correct', subtitleKey: null, showAttempt: false,
    });
  });

  it('separates the prominent article-error verdict from its explanation', () => {
    expect(buildReviewReveal('der', feedback({ outcome: 'gender', tint: 'close', articleWrong: true }))).toMatchObject({
      verdict: { verdictKey: 'review.type.almost', subtitleKey: 'review.type.mindGender' },
    });
  });
});
