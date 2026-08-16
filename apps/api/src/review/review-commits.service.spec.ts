import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { parseReviewCommit } from './review-commit.parser';

function createCommit() {
  const reviewedAt = '2026-08-14T10:00:00.000Z';
  return {
    event: {
      type: 'ReviewCommitted',
      schemaVersion: 1,
      eventId: 'event-1',
      attemptId: 'attempt-1',
      reviewId: 'review-1',
      cardId: 'card-1',
      sessionId: 'session-1',
      reviewedAt,
      mode: 'recall',
      direction: 'source_to_target',
      responseType: 'self_rated',
      rating: 'good',
      stageBefore: 'new',
      stageAfter: 'learning',
      becameMastered: false,
      lostMastery: false,
      becameLeech: false,
      recoveredFromLeech: false,
      wasRelearning: false,
    },
    record: {
      reviewId: 'review-1',
      attemptId: 'attempt-1',
      cardId: 'card-1',
      sessionId: 'session-1',
      reviewedAt,
      reviewMode: 'recall',
      promptDirection: 'source_to_target',
      responseType: 'self_rated',
      rating: 'good',
      stageBefore: 'new',
      stageAfter: 'learning',
      problemStatusBefore: 'normal',
      problemStatusAfter: 'normal',
      wasRelearning: false,
    },
    nextState: {
      cardId: 'card-1',
      stage: 'learning',
      intervalMinutes: 1_440,
      dueAt: '2026-08-15T10:00:00.000Z',
      problemStatus: 'normal',
      totalReviewCount: 1,
      totalAgainCount: 0,
      recentRatings: ['good'],
      successfulReviewsSinceLastAgain: 1,
    },
  };
}

describe('parseReviewCommit', () => {
  it('accepts a consistent committed review payload', () => {
    expect(parseReviewCommit(createCommit()).event.eventId).toBe('event-1');
  });

  it('rejects a record that does not describe the same attempt', () => {
    const value = createCommit();
    value.record.attemptId = 'different-attempt';

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });

  it('rejects impossible scheduling counters', () => {
    const value = createCommit();
    value.nextState.totalAgainCount = 2;

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });

  it('rejects malformed optional scheduling state', () => {
    const value = createCommit();
    Object.assign(value.nextState, { relearning: 'invalid' });

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });

  it('rejects a forged earned-mastery fact', () => {
    const value = createCommit();
    value.event.becameMastered = true;

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });

  it('rejects a review event that omits its response contract', () => {
    const value = createCommit();
    Reflect.deleteProperty(value.event, 'responseType');

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });

  it('rejects a non-UTC review timestamp', () => {
    const value = createCommit();
    value.event.reviewedAt = '2026-08-14T12:00:00.000+02:00';
    value.record.reviewedAt = value.event.reviewedAt;

    expect(() => parseReviewCommit(value)).toThrow(BadRequestException);
  });
});
