import { Injectable } from '@angular/core';
import type { ArticleType } from '@lingua-card/shared/domain';
import type { AnswerEvaluation, AnswerIssue, AnswerEvaluationResult } from '../domain/review-domain';

export type TypedAnswerOutcome = 'correct' | 'gender' | 'close' | 'wrong';

export interface TypedCharacterFeedback {
  ch: string;
  ok: boolean;
}

export interface TypedAnswerFeedback {
  outcome: TypedAnswerOutcome;
  tint: 'correct' | 'close' | 'wrong';
  correctArticle: ArticleType | null;
  userArticle: ArticleType | null;
  articleWrong: boolean;
  youChars: readonly TypedCharacterFeedback[];
  typedRaw: string;
}

export interface TypedAnswerEvaluation {
  evaluation: AnswerEvaluation;
  feedback: TypedAnswerFeedback;
}

export interface EvaluateTypedAnswerRequest {
  answer: string;
  expectedWord: string;
  expectedArticle: ArticleType | null;
}

const ARTICLE_PATTERN = /^(der|die|das)\s+(.*)$/;

@Injectable({ providedIn: 'root' })
export class AnswerEvaluatorService {
  evaluateTypedAnswer(request: EvaluateTypedAnswerRequest): TypedAnswerEvaluation {
    const typedRaw = request.answer.trim();
    const normalizedAnswer = typedRaw.toLowerCase().replace(/\s+/g, ' ');
    const expectedWord = request.expectedWord.trim();
    const normalizedExpectedWord = expectedWord.toLowerCase();
    const expectedAnswer = request.expectedArticle
      ? `${request.expectedArticle} ${expectedWord}`
      : expectedWord;
    const parsed = parseAnswer(normalizedAnswer);
    const submittedWord = parsed.article ? parsed.remainder : normalizedAnswer;
    const wordIsExact = submittedWord === normalizedExpectedWord;
    const wordIsClose = normalizedExpectedWord.length > 3
      && levenshteinDistance(submittedWord, normalizedExpectedWord) <= 2;
    const articleWrong = request.expectedArticle !== null && parsed.article !== request.expectedArticle;
    const outcome = resolveOutcome(wordIsExact, wordIsClose, articleWrong);
    const result = evaluationResultFor(outcome);

    return {
      evaluation: {
        result,
        issues: issuesFor(outcome, articleWrong),
        suggestedRating: result === 'correct' ? 'good' : result === 'partially_correct' ? 'hard' : 'again',
        normalizedAnswer,
        expectedAnswers: [expectedAnswer],
      },
      feedback: {
        outcome,
        tint: outcome === 'correct' ? 'correct' : outcome === 'wrong' ? 'wrong' : 'close',
        correctArticle: request.expectedArticle,
        userArticle: parsed.article,
        articleWrong,
        youChars: characterFeedback(typedRaw, expectedAnswer),
        typedRaw,
      },
    };
  }
}

function parseAnswer(answer: string): { article: ArticleType | null; remainder: string } {
  const match = answer.match(ARTICLE_PATTERN);
  if (!match) return { article: null, remainder: answer };
  const article = match[1];
  if (article !== 'der' && article !== 'die' && article !== 'das') {
    return { article: null, remainder: answer };
  }
  return { article, remainder: match[2].trim() };
}

function resolveOutcome(
  wordIsExact: boolean,
  wordIsClose: boolean,
  articleWrong: boolean,
): TypedAnswerOutcome {
  if (wordIsExact && !articleWrong) return 'correct';
  if (wordIsExact) return 'gender';
  if (wordIsClose) return 'close';
  return 'wrong';
}

function evaluationResultFor(outcome: TypedAnswerOutcome): AnswerEvaluationResult {
  if (outcome === 'correct') return 'correct';
  if (outcome === 'wrong') return 'incorrect';
  return 'partially_correct';
}

function issuesFor(outcome: TypedAnswerOutcome, articleWrong: boolean): AnswerIssue[] {
  if (articleWrong) return ['wrong_article'];
  if (outcome === 'close') return ['minor_spelling_error'];
  return [];
}

function characterFeedback(typed: string, expected: string): TypedCharacterFeedback[] {
  return [...typed].map((ch, index) => ({
    ch,
    ok: expected[index]?.toLowerCase() === ch.toLowerCase(),
  }));
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : 1 + Math.min(previous[rightIndex - 1], above, diagonal);
      diagonal = above;
    }
  }
  return previous[right.length];
}
