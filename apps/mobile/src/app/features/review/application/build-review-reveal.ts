import type { ArticleType } from '@lingua-card/shared/domain';
import type { TypedAnswerFeedback } from '../services/answer-evaluator.service';

export type ReviewAnswerSurface = ArticleType | 'neutral';

export interface ReviewVerdictView {
  tint: 'correct' | 'close' | 'wrong';
  icon: string;
  verdictKey: string;
  showAttempt: boolean;
}

export interface ReviewRevealView {
  answerSurface: ReviewAnswerSurface;
  verdict: ReviewVerdictView | null;
}

const VERDICT_KEY = {
  correct: 'review.type.correct',
  gender: 'review.type.mindGender',
  close: 'review.type.soClose',
  wrong: 'review.type.notQuite',
} as const;

const VERDICT_ICON = { correct: '✓', close: '≈', wrong: '✕' } as const;

/** Keeps correctness status independent from the article-driven answer surface. */
export function buildReviewReveal(
  article: ArticleType | null | undefined,
  feedback: TypedAnswerFeedback | null,
): ReviewRevealView {
  return {
    answerSurface: article ?? 'neutral',
    verdict: feedback ? {
      tint: feedback.tint,
      icon: VERDICT_ICON[feedback.tint],
      verdictKey: VERDICT_KEY[feedback.outcome],
      showAttempt: feedback.outcome !== 'correct',
    } : null,
  };
}
