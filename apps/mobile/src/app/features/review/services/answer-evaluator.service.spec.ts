import { AnswerEvaluatorService } from './answer-evaluator.service';

describe('AnswerEvaluatorService', () => {
  const evaluator = new AnswerEvaluatorService();

  test('maps an exact noun and article to a Good suggestion', () => {
    const result = evaluator.evaluateTypedAnswer({
      answer: '  Der   Zustand  ',
      expectedWord: 'Zustand',
      expectedArticle: 'der',
    });

    expect(result.evaluation).toEqual({
      result: 'correct',
      issues: [],
      suggestedRating: 'good',
      normalizedAnswer: 'der zustand',
      expectedAnswers: ['der Zustand'],
    });
    expect(result.feedback.outcome).toBe('correct');
  });

  test('maps a missing required article to a Hard suggestion', () => {
    const result = evaluator.evaluateTypedAnswer({
      answer: 'Zustand',
      expectedWord: 'Zustand',
      expectedArticle: 'der',
    });

    expect(result.evaluation).toMatchObject({
      result: 'partially_correct',
      issues: ['wrong_article'],
      suggestedRating: 'hard',
    });
    expect(result.feedback.articleWrong).toBe(true);
  });

  test('maps a minor spelling error to Hard and a wrong answer to Again', () => {
    const close = evaluator.evaluateTypedAnswer({
      answer: 'Zustnd',
      expectedWord: 'Zustand',
      expectedArticle: null,
    });
    const wrong = evaluator.evaluateTypedAnswer({
      answer: 'Maschine',
      expectedWord: 'Zustand',
      expectedArticle: null,
    });

    expect(close.evaluation).toMatchObject({
      result: 'partially_correct', issues: ['minor_spelling_error'], suggestedRating: 'hard',
    });
    expect(wrong.evaluation).toMatchObject({
      result: 'incorrect', issues: [], suggestedRating: 'again',
    });
  });
});
