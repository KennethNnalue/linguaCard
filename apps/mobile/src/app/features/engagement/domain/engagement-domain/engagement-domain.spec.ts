import {
  applyReviewToDailyProgress, applyRewardPolicy, buildSessionCelebration, calculateStreak,
  DailyProgress, DEFAULT_REWARD_POLICY, engagementDayKey, resolveEngagementDayKey,
  reconcileClosedStreakDays, ReviewCommittedEvent, streakFreezeInventory,
} from './index';

const dayKey = engagementDayKey('2026-08-16');

function createEvent(overrides: Partial<ReviewCommittedEvent> = {}): ReviewCommittedEvent {
  return {
    type: 'ReviewCommitted', schemaVersion: 1, eventId: 'event-1', reviewId: 'review-1', attemptId: 'attempt-1',
    cardId: 'card-1', sessionId: 'session-1', reviewedAt: new Date('2026-08-16T10:00:00.000Z'),
    mode: 'recall', direction: 'source_to_target', responseType: 'self_rated', rating: 'again',
    stageBefore: 'learning', stageAfter: 'learning', becameMastered: false, lostMastery: false,
    becameLeech: false, recoveredFromLeech: false, wasRelearning: false, ...overrides,
  };
}

function createProgress(overrides: Partial<DailyProgress> = {}): DailyProgress {
  return {
    userId: 'user-1', dayKey, targetUniqueCards: 2, reviewedCardIds: [], uniqueCardsReviewed: 0,
    committedReviewCount: 0, ...overrides,
  };
}

describe('engagement domain', () => {
  test('counts the first card review without mutating input', () => {
    const progress = createProgress();
    const transition = applyReviewToDailyProgress(progress, createEvent(), dayKey);
    expect(transition.next).toMatchObject({ uniqueCardsReviewed: 1, committedReviewCount: 1 });
    expect(transition.contribution.addedUniqueCard).toBe(true);
    expect(progress).toEqual(createProgress());
  });

  test('counts a repeated card only as another committed attempt', () => {
    const progress = createProgress({ reviewedCardIds: ['card-1'], uniqueCardsReviewed: 1, committedReviewCount: 1 });
    const transition = applyReviewToDailyProgress(progress, createEvent({ eventId: 'event-2', attemptId: 'attempt-2' }), dayKey);
    expect(transition.next).toMatchObject({ uniqueCardsReviewed: 1, committedReviewCount: 2 });
    expect(transition.contribution.addedUniqueCard).toBe(false);
  });

  test('records the goal transition exactly once', () => {
    const progress = createProgress({ reviewedCardIds: ['card-1'], uniqueCardsReviewed: 1 });
    const reached = applyReviewToDailyProgress(progress, createEvent({ eventId: 'goal-event', cardId: 'card-2' }), dayKey);
    const after = applyReviewToDailyProgress(reached.next, createEvent({ eventId: 'after-event', cardId: 'card-3' }), dayKey);
    expect(reached.goalTransition).toBe('reached_now');
    expect(reached.next.firstGoalReachingEventId).toBe('goal-event');
    expect(after.goalTransition).toBe('already_reached');
    expect(after.next.goalReachedAt).toEqual(reached.next.goalReachedAt);
  });

  test('awards first-card, goal, and earned-mastery transactions using stable deduplication keys', () => {
    const event = createEvent({ eventId: 'goal-event', cardId: 'card-2', becameMastered: true, stageAfter: 'mastered' });
    const transition = applyReviewToDailyProgress(
      createProgress({ reviewedCardIds: ['card-1'], uniqueCardsReviewed: 1 }), event, dayKey,
    );
    const rewards = applyRewardPolicy({
      userId: 'user-1', event, dailyProgressTransition: transition, dayKey, policy: DEFAULT_REWARD_POLICY,
      transactionId: reason => `${reason}-transaction`,
    });
    expect(rewards.map(reward => reward.deduplicationKey)).toEqual([
      'review-card:user-1:2026-08-16:card-2', 'daily-goal:user-1:2026-08-16', 'earned-mastery:goal-event',
    ]);
    expect(rewards.reduce((total, reward) => total + reward.amount, 0)).toBe(16);
  });

  test('does not penalize Again or reward a repeat card', () => {
    const progress = createProgress({ reviewedCardIds: ['card-1'], uniqueCardsReviewed: 1 });
    const event = createEvent();
    const rewards = applyRewardPolicy({
      userId: 'user-1', event, dailyProgressTransition: applyReviewToDailyProgress(progress, event, dayKey),
      dayKey, policy: DEFAULT_REWARD_POLICY, transactionId: reason => reason,
    });
    expect(rewards).toEqual([]);
  });

  test('resolves the engagement day in the configured timezone across UTC midnight', () => {
    expect(resolveEngagementDayKey(new Date('2026-08-16T22:30:00.000Z'), 'Europe/Berlin')).toBe('2026-08-17');
    expect(resolveEngagementDayKey(new Date('2026-08-16T00:30:00.000Z'), 'America/Los_Angeles')).toBe('2026-08-15');
  });

  test('keeps streak continuity through a protected day', () => {
    const streak = calculateStreak([
      { dayKey: engagementDayKey('2026-08-14'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
      { dayKey: engagementDayKey('2026-08-15'), goalTarget: 2, uniqueCardsReviewed: 0, status: 'protected_by_freeze', freezeTransactionId: 'freeze-1' },
      { dayKey, goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
    ], dayKey);
    expect(streak).toMatchObject({ current: 3, longest: 3, state: 'safe' });
  });

  test('marks an open today at risk when yesterday qualified', () => {
    const streak = calculateStreak([
      { dayKey: engagementDayKey('2026-08-15'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
      { dayKey, goalTarget: 2, uniqueCardsReviewed: 0, status: 'open' },
    ], dayKey);
    expect(streak).toMatchObject({ current: 1, state: 'at_risk' });
  });

  test('does not count sparse qualified days as a consecutive longest streak', () => {
    const streak = calculateStreak([
      { dayKey: engagementDayKey('2026-08-12'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
      { dayKey: engagementDayKey('2026-08-14'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
      { dayKey, goalTarget: 2, uniqueCardsReviewed: 0, status: 'open' },
    ], dayKey);
    expect(streak.longest).toBe(1);
  });

  test('derives freeze inventory from immutable transactions', () => {
    expect(streakFreezeInventory([
      { transactionId: 'grant', userId: 'user-1', occurredAt: new Date(), amount: 2, reason: 'granted', sourceId: 'grant-1' },
      { transactionId: 'consume', userId: 'user-1', occurredAt: new Date(), amount: -1, reason: 'consumed', sourceId: 'freeze:user-1:2026-08-15', protectedDayKey: engagementDayKey('2026-08-15') },
    ])).toBe(1);
  });

  test('consumes one freeze for one closed missed day', () => {
    const reconciliation = reconcileClosedStreakDays({
      userId: 'user-1', todayKey: dayKey, occurredAt: new Date('2026-08-16T08:00:00.000Z'),
      days: [
        { dayKey: engagementDayKey('2026-08-14'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
        { dayKey: engagementDayKey('2026-08-16'), goalTarget: 2, uniqueCardsReviewed: 0, status: 'open' },
      ],
      transactions: [{ transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date('2026-08-14T08:00:00.000Z'), amount: 1, reason: 'granted', sourceId: 'grant-1' }],
      goalTarget: () => 2,
      transactionId: closedDayKey => `consumed:${closedDayKey}`,
    });
    expect(reconciliation.consumed).toHaveLength(1);
    expect(reconciliation.consumed[0]).toMatchObject({
      amount: -1, reason: 'consumed', protectedDayKey: '2026-08-15', sourceId: 'freeze:user-1:2026-08-15',
    });
    expect(reconciliation.days.find(day => day.dayKey === '2026-08-15')).toMatchObject({
      status: 'protected_by_freeze', uniqueCardsReviewed: 0,
    });
  });

  test('never consumes a freeze for the open current day', () => {
    const reconciliation = reconcileClosedStreakDays({
      userId: 'user-1', todayKey: dayKey, occurredAt: new Date('2026-08-16T23:59:59.000Z'),
      days: [{ dayKey, goalTarget: 2, uniqueCardsReviewed: 0, status: 'open' }],
      transactions: [{ transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date(), amount: 1, reason: 'granted', sourceId: 'grant-1' }],
      goalTarget: () => 2, transactionId: closedDayKey => `consumed:${closedDayKey}`,
    });
    expect(reconciliation.consumed).toEqual([]);
    expect(streakFreezeInventory(reconciliation.transactions)).toBe(1);
  });

  test('is idempotent when a protected day is reconciled again', () => {
    const consumption = {
      transactionId: 'consumed:2026-08-15', userId: 'user-1', occurredAt: new Date('2026-08-16T08:00:00.000Z'),
      amount: -1, reason: 'consumed' as const, protectedDayKey: engagementDayKey('2026-08-15'), sourceId: 'freeze:user-1:2026-08-15',
    };
    const reconciliation = reconcileClosedStreakDays({
      userId: 'user-1', todayKey: dayKey, occurredAt: new Date('2026-08-16T09:00:00.000Z'),
      days: [
        { dayKey: engagementDayKey('2026-08-14'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' },
        { dayKey: engagementDayKey('2026-08-15'), goalTarget: 2, uniqueCardsReviewed: 0, status: 'protected_by_freeze', freezeTransactionId: consumption.transactionId },
      ],
      transactions: [
        { transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date(), amount: 1, reason: 'granted', sourceId: 'grant-1' },
        consumption,
      ],
      goalTarget: () => 2, transactionId: closedDayKey => `duplicate:${closedDayKey}`,
    });
    expect(reconciliation.consumed).toEqual([]);
    expect(reconciliation.transactions).toHaveLength(2);
  });

  test('marks additional missed days without fabricating activity when inventory is exhausted', () => {
    const reconciliation = reconcileClosedStreakDays({
      userId: 'user-1', todayKey: dayKey, occurredAt: new Date('2026-08-16T08:00:00.000Z'),
      days: [{ dayKey: engagementDayKey('2026-08-13'), goalTarget: 2, uniqueCardsReviewed: 2, status: 'goal_met' }],
      transactions: [{ transactionId: 'grant-1', userId: 'user-1', occurredAt: new Date(), amount: 1, reason: 'granted', sourceId: 'grant-1' }],
      goalTarget: () => 2, transactionId: closedDayKey => `consumed:${closedDayKey}`,
    });
    expect(reconciliation.days.find(day => day.dayKey === '2026-08-14')?.status).toBe('protected_by_freeze');
    expect(reconciliation.days.find(day => day.dayKey === '2026-08-15')).toMatchObject({ status: 'missed', uniqueCardsReviewed: 0 });
    expect(reconciliation.consumed).toHaveLength(1);
  });

  test('builds a goal-completed celebration from ledger transactions', () => {
    const event = createEvent({ eventId: 'goal-event', cardId: 'card-2', becameMastered: true });
    const transition = applyReviewToDailyProgress(createProgress({ reviewedCardIds: ['card-1'], uniqueCardsReviewed: 1 }), event, dayKey);
    const rewardTransactions = applyRewardPolicy({
      userId: 'user-1', event, dailyProgressTransition: transition, dayKey, policy: DEFAULT_REWARD_POLICY,
      transactionId: reason => reason,
    });
    const result = { eventId: event.eventId, dayKey, dailyProgress: transition.next,
      streak: { current: 4, longest: 4, state: 'safe' as const, lastQualifiedDayKey: dayKey },
      rewardTransactions, pointsAwarded: 16,
      feedback: { kind: 'daily_goal_reached' as const, feedbackId: 'feedback', dayKey, current: 2, target: 2, messageKey: 'review.engagement.dailyGoalComplete' as const },
    };
    expect(buildSessionCelebration({
      sessionId: 'session-1', committedReviewCount: 2, uniqueCardsReviewedInSession: 2,
      engagementResults: [result], dailyProgressAtCompletion: transition.next,
      streakAtCompletion: result.streak, learningPointsBalance: 50,
    })).toMatchObject({ intensity: 'goal_completed', earnedMasteryCount: 1,
      rewards: { pointsEarnedInSession: 16, dailyGoalBonus: 10, totalLearningPoints: 50 } });
  });
});
