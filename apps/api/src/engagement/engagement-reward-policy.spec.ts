import { describe, expect, test } from '@jest/globals';
import { buildServerRewardAwards } from './engagement-reward-policy';

describe('buildServerRewardAwards', () => {
  test('uses stable deduplication identities for all earned rewards', () => {
    const awards = buildServerRewardAwards({
      userId: 'user-1', dayKey: '2026-08-16', addedUniqueCard: true, reachedGoalNow: true,
      sourcePodcastEpisodeId: null,
      recoveredAfterIncorrect: false,
      event: {
        eventId: 'event-1', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:00:00.000Z', becameMastered: true, rating: 'good',
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
      sourcePodcastEpisodeId: null,
      recoveredAfterIncorrect: false,
      event: {
        eventId: 'event-2', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:05:00.000Z', becameMastered: false, rating: 'again',
      },
    })).toEqual([]);
  });

  test('awards a podcast vocabulary retrieval only once per episode and card identity', () => {
    const awards = buildServerRewardAwards({
      userId: 'user-1', dayKey: '2026-08-16', addedUniqueCard: true, reachedGoalNow: false,
      sourcePodcastEpisodeId: 'episode-1',
      recoveredAfterIncorrect: false,
      event: {
        eventId: 'event-3', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:10:00.000Z', becameMastered: false, rating: 'good',
      },
    });
    expect(awards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'podcast_word_retrieved',
        deduplicationKey: 'podcast-word-retrieved:user-1:episode-1:card-1',
      }),
    ]));
  });

  test('awards recovery once per card and local day after an earlier incorrect attempt', () => {
    const awards = buildServerRewardAwards({
      userId: 'user-1', dayKey: '2026-08-16', addedUniqueCard: false, reachedGoalNow: false,
      sourcePodcastEpisodeId: null, recoveredAfterIncorrect: true,
      event: {
        eventId: 'event-4', cardId: 'card-1', sessionId: 'session-1',
        reviewedAt: '2026-08-16T10:15:00.000Z', becameMastered: false, rating: 'good',
      },
    });
    expect(awards).toEqual([expect.objectContaining({
      reason: 'recovered_card_review',
      deduplicationKey: 'recovered-review:user-1:2026-08-16:card-1',
    })]);
  });
});
