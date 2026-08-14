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
      rating: 'good',
    },
    record: {
      reviewId: 'review-1',
      attemptId: 'attempt-1',
      cardId: 'card-1',
      sessionId: 'session-1',
      reviewedAt,
      rating: 'good',
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
});
