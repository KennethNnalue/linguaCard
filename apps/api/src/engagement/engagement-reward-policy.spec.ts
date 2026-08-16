import { describe, expect, test } from '@jest/globals';
import { buildServerRewardAwards } from './engagement-reward-policy';

describe('buildServerRewardAwards', () => {
  test('uses stable deduplication identities for all earned rewards', () => {
    const awards = buildServerRewardAwards({
      userId: 'user-1', dayKey: '2026-08-16', addedUniqueCard: true, reachedGoalNow: true,
      event: {
        eventId: 'event-1', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:00:00.000Z', becameMastered: true,
      },
    });
    expect(awards.map(award => award.deduplicationKey)).toEqual([
      'review-card:user-1:2026-08-16:card-1',
      'daily-goal:user-1:2026-08-16',
      'earned-mastery:event-1',
    ]);
  });

  test('a repeated non-mastery review earns no reward', () => {
    expect(buildServerRewardAwards({
      userId: 'user-1', dayKey: '2026-08-16', addedUniqueCard: false, reachedGoalNow: false,
      event: {
        eventId: 'event-2', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:05:00.000Z', becameMastered: false,
      },
    })).toEqual([]);
  });
});
