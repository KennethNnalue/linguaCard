import {
  CardSchedulingState, MINUTES_PER_DAY as D,
  commitReview, createNewSchedulingState, createReviewSession, deriveLearningStage,
  isCardOverdue, markAsMastered, previewRatings, projectDailyProgress,
  recordPresentation, recordSessionReview, scheduleReview, selectNextCard,
  resolvePresentation, skipSessionCard, suggestedRatingFor, undoManualMastery,
} from './review-domain';

const now = new Date('2026-08-14T10:00:00.000Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const state = (patch: Partial<CardSchedulingState> = {}): CardSchedulingState => ({
  ...createNewSchedulingState('card-1'), ...patch,
});
const command = (patch: Partial<Parameters<typeof commitReview>[1]> = {}): Parameters<typeof commitReview>[1] => ({
  reviewId: 'review-1', eventId: 'event-1', attemptId: 'attempt-1', sessionId: 'session-1',
  reviewedAt: now, reviewMode: 'recall', promptDirection: 'source_to_target', responseType: 'self_rated', rating: 'good', ...patch,
});

describe('stage derivation and new cards', () => {
  test.each([[1, 'learning'], [3 * D, 'familiar'], [14 * D, 'strong'], [60 * D, 'mastered']] as const)('%i minutes -> %s', (minutes, expected) => expect(deriveLearningStage(minutes)).toBe(expected));
  test.each([['again', 10, 'learning'], ['hard', 30, 'learning'], ['good', D, 'learning'], ['easy', 4 * D, 'familiar']] as const)('new + %s', (rating, minutes, stage) => {
    const result = scheduleReview(state(), rating, now);
    expect(result.nextIntervalMinutes).toBe(minutes);
    expect(result.nextState.stage).toBe(stage);
    expect(result.dueAt).toEqual(at(minutes));
    expect(result.becameMastered).toBe(false);
  });
});

describe('normal and mastered scheduling', () => {
  test('learning, familiar and strong multipliers are applied', () => {
    expect(scheduleReview(state({ stage: 'learning', intervalMinutes: D }), 'good', now).nextIntervalMinutes).toBe(2 * D);
    expect(scheduleReview(state({ stage: 'familiar', intervalMinutes: 10 * D }), 'easy', now).nextIntervalMinutes).toBe(25 * D);
    expect(scheduleReview(state({ stage: 'strong', intervalMinutes: 20 * D }), 'good', now).nextIntervalMinutes).toBe(36 * D);
  });
  test('strong card earns mastery when produced interval crosses 60d', () => {
    const result = scheduleReview(state({ stage: 'strong', intervalMinutes: 40 * D }), 'good', now);
    expect(result.nextState).toMatchObject({ stage: 'mastered', masterySource: 'earned', intervalMinutes: 72 * D });
    expect(result.becameMastered).toBe(true);
  });
  test('successful mastered review never demotes and caps at 365d', () => {
    const result = scheduleReview(state({ stage: 'mastered', masterySource: 'earned', intervalMinutes: 200 * D }), 'easy', now);
    expect(result.nextState.stage).toBe('mastered');
    expect(result.nextIntervalMinutes).toBe(365 * D);
  });
  test('overdue uses actual review time and has no implicit penalty', () => {
    const late = state({ stage: 'familiar', intervalMinutes: 7 * D, dueAt: new Date('2026-08-01T10:00:00Z') });
    expect(isCardOverdue(late, now)).toBe(true);
    const result = scheduleReview(late, 'good', now);
    expect(result.nextIntervalMinutes).toBe(14 * D);
    expect(result.dueAt).toEqual(at(14 * D));
  });
});

describe('relearning', () => {
  const lapsed = () => scheduleReview(state({ stage: 'mastered', masterySource: 'earned', intervalMinutes: 90 * D }), 'again', now).nextState;
  test('lapse preserves origin, removes active mastery, and schedules 10m', () => {
    const result = scheduleReview(state({ stage: 'mastered', masterySource: 'earned', intervalMinutes: 90 * D }), 'again', now);
    expect(result.lostMastery).toBe(true);
    expect(result.nextState.relearning).toEqual({ previousStage: 'mastered', previousIntervalMinutes: 90 * D, step: 'immediate' });
    expect(result.nextIntervalMinutes).toBe(10);
  });
  test('immediate Good, one-day Good, final Good recovers at half capped to 45d', () => {
    const oneDay = scheduleReview(lapsed(), 'good', at(10)).nextState;
    expect(oneDay.relearning?.step).toBe('one_day');
    const final = scheduleReview(oneDay, 'good', at(10 + D)).nextState;
    expect(final.relearning?.step).toBe('final');
    const recovered = scheduleReview(final, 'good', at(10 + 4 * D)).nextState;
    expect(recovered.relearning).toBeUndefined();
    expect(recovered.intervalMinutes).toBe(45 * D);
    expect(recovered.stage).toBe('strong');
  });
  test('Again resets any relearning step to immediate', () => {
    const final = { ...lapsed(), relearning: { previousStage: 'mastered' as const, previousIntervalMinutes: 90 * D, step: 'final' as const } };
    expect(scheduleReview(final, 'again', now).nextState.relearning?.step).toBe('immediate');
  });
});

describe('leech behavior', () => {
  test('requires both total and recent thresholds', () => {
    const almost = state({ stage: 'learning', intervalMinutes: D, totalAgainCount: 7, recentRatings: ['good','good','good','good','good','good','good','again','again'] });
    const result = scheduleReview(almost, 'again', now);
    expect(result.nextState.problemStatus).toBe('leech');
    expect(result.becameLeech).toBe(true);
  });
  test('three Hard/Good/Easy successes recover a leech; Again resets streak', () => {
    let current = state({ stage: 'learning', intervalMinutes: D, problemStatus: 'leech' });
    current = scheduleReview(current, 'hard', now).nextState;
    current = scheduleReview(current, 'good', now).nextState;
    expect(current.problemStatus).toBe('leech');
    current = scheduleReview(current, 'easy', now).nextState;
    expect(current.problemStatus).toBe('normal');
    current = { ...current, problemStatus: 'leech', successfulReviewsSinceLastAgain: 2 };
    expect(scheduleReview(current, 'again', now).nextState.successfulReviewsSinceLastAgain).toBe(0);
  });
});

describe('manual mastery', () => {
  test('does not fabricate review activity and undo restores New', () => {
    const manual = markAsMastered(state());
    expect(manual).toMatchObject({ stage: 'mastered', masterySource: 'manual', totalReviewCount: 0 });
    expect(manual.dueAt).toBeUndefined();
    expect(undoManualMastery(manual, now).stage).toBe('new');
  });
  test('undo caps a reviewed card at 7d and schedules from undo time', () => {
    const manual = markAsMastered(state({ stage: 'strong', intervalMinutes: 30 * D, dueAt: at(30 * D) }));
    const restored = undoManualMastery(manual, now);
    expect(restored).toMatchObject({ stage: 'familiar', intervalMinutes: 7 * D, masterySource: undefined });
    expect(restored.dueAt).toEqual(at(7 * D));
  });
});

describe('preview, answer contract, and commit', () => {
  test('preview and commit are identical for every rating', () => {
    const card = state({ stage: 'familiar', intervalMinutes: 7 * D });
    const previews = previewRatings(card, now);
    for (const rating of ['again','hard','good','easy'] as const) {
      expect(commitReview(card, command({ rating })).schedule).toEqual(previews[rating]);
    }
  });
  test.each([['correct','good'], ['partially_correct','hard'], ['incorrect','again']] as const)('%s suggests %s', (result, rating) => expect(suggestedRatingFor(result)).toBe(rating));
  test("don't know must be Again", () => expect(() => commitReview(state(), command({ reviewMode: 'typing', responseType: 'dont_know', rating: 'good' }))).toThrow());
  test('typed evaluation preserves suggested rating when final rating is overridden', () => {
    const evaluation = { result: 'partially_correct' as const, issues: ['missing_article' as const], suggestedRating: 'hard' as const, normalizedAnswer: 'zustand', expectedAnswers: ['der Zustand'] };
    const result = commitReview(state(), command({ reviewMode: 'typing', responseType: 'typed_answer', rating: 'good', answerEvaluation: evaluation }));
    expect(result.record.answerEvaluation?.suggestedRating).toBe('hard');
    expect(result.record.rating).toBe('good');
    expect(result.event).toMatchObject({ type: 'ReviewCommitted', schemaVersion: 1, reviewId: 'review-1', attemptId: 'attempt-1' });
  });
});

describe('session state machine and skip semantics', () => {
  const definition = {
    id: 's',
    source: { kind: 'daily' } as const,
    mode: 'typing' as const,
    direction: 'source_to_target' as const,
    originalCardIds: ['A','B'],
    startedAt: now,
  };
  test('first original skip moves later; second excludes without a review', () => {
    let session = createReviewSession(definition);
    session = recordPresentation(session, { kind: 'present', cardId: 'A', presentationKind: 'original' });
    session = skipSessionCard(session, 'A', 'original');
    expect(session.sessionSkippedCardIds).toEqual([]);
    const second = selectNextCard(session, new Map(), now);
    expect(second).toMatchObject({ cardId: 'B', presentationKind: 'original' });
    if (second.kind !== 'present') throw new Error('expected presentation');
    session = recordSessionReview(recordPresentation(session, second), 'B', 'original');
    const repeated = selectNextCard(session, new Map(), now);
    expect(repeated).toMatchObject({ cardId: 'A', presentationKind: 'original' });
    if (repeated.kind !== 'present') throw new Error('expected presentation');
    session = recordPresentation(session, repeated);
    session = skipSessionCard(session, 'A', 'original');
    expect(session.sessionSkippedCardIds).toEqual(['A']);
    expect(session.reviewAttemptCount).toBe(1);
  });
  test('relearning skip excludes immediately', () => {
    const session = recordPresentation(createReviewSession(definition), {
      kind: 'present',
      cardId: 'A',
      presentationKind: 'relearning',
    });
    expect(skipSessionCard(session, 'A', 'relearning').sessionSkippedCardIds).toEqual(['A']);
  });
  test('mixed direction resolves deterministically per original card', () => {
    const session = createReviewSession({ ...definition, direction: 'mixed' });
    const first = { kind: 'present', cardId: 'A', presentationKind: 'original' } as const;
    const second = { kind: 'present', cardId: 'B', presentationKind: 'original' } as const;
    expect(resolvePresentation(recordPresentation(session, first), first).direction).toBe('source_to_target');
    expect(resolvePresentation(recordPresentation(session, second), second).direction).toBe('target_to_source');
  });
  test('Again resolves original progress but due relearning may reappear', () => {
    let session = createReviewSession(definition);
    const first = selectNextCard(session, new Map(), now);
    if (first.kind !== 'present') throw new Error('expected presentation');
    session = recordPresentation(session, first);
    session = recordSessionReview(session, 'A', 'original');
    expect(session.completedOriginalCardIds).toEqual(['A']);
    const a = state({ cardId: 'A', stage: 'familiar', intervalMinutes: 10, dueAt: now, relearning: { previousStage: 'familiar', previousIntervalMinutes: 7 * D, step: 'immediate' } });
    expect(selectNextCard(session, new Map([['A', a]]), now)).toMatchObject({ cardId: 'A', presentationKind: 'relearning' });
  });
  test('resume retains an unresolved current presentation', () => {
    const session = recordPresentation(createReviewSession(definition), {
      kind: 'present',
      cardId: 'A',
      presentationKind: 'original',
    });
    expect(selectNextCard(session, new Map(), at(20))).toEqual({
      kind: 'present',
      cardId: 'A',
      presentationKind: 'original',
    });
  });
  test('review and skip reject a card that is not currently presented', () => {
    const session = createReviewSession(definition);
    expect(() => recordSessionReview(session, 'A', 'original')).toThrow('Operation must target the current presentation');
    expect(() => skipSessionCard(session, 'A', 'original')).toThrow('Operation must target the current presentation');
  });
  test('at most one relearning presentation is interleaved between originals', () => {
    const a = state({ cardId: 'A', stage: 'familiar', intervalMinutes: 10, dueAt: now, relearning: { previousStage: 'familiar', previousIntervalMinutes: 7 * D, step: 'immediate' } });
    let session = createReviewSession(definition);
    session = { ...session, lastPresentationKind: 'relearning' };
    expect(selectNextCard(session, new Map([['A', a]]), now)).toMatchObject({ cardId: 'A', presentationKind: 'original' });
  });
  test('completes instead of waiting for future relearning and remains terminal', () => {
    const future = state({ cardId: 'A', stage: 'familiar', intervalMinutes: 10, dueAt: at(10), relearning: { previousStage: 'familiar', previousIntervalMinutes: 7 * D, step: 'immediate' } });
    const exhausted = { ...createReviewSession(definition), completedOriginalCardIds: ['A','B'] };
    const result = selectNextCard(exhausted, new Map([['A', future]]), now);
    expect(result.kind).toBe('complete');
    if (result.kind === 'complete') expect(selectNextCard(result.state, new Map(), at(20)).kind).toBe('complete');
  });
});

describe('daily progress projection', () => {
  test('counts attempts and unique cards separately', () => {
    const event = commitReview(state(), command()).event;
    const once = projectDailyProgress(undefined, event, '2026-08-14');
    const twice = projectDailyProgress(once, { ...event, eventId: 'event-2', reviewId: 'review-2' }, '2026-08-14');
    expect(twice).toMatchObject({ committedReviews: 2, uniqueCardsReviewed: 1 });
  });
  test('ignores an event that has already been projected', () => {
    const event = commitReview(state(), command()).event;
    const once = projectDailyProgress(undefined, event, '2026-08-14');

    expect(projectDailyProgress(once, event, '2026-08-14')).toBe(once);
  });
});
