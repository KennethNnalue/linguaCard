import { DailyProgress } from '../daily-progress/daily-progress';
import { EngagementProjectionResult } from '../shared/projection-result';
import { Streak } from '../streak/streak';

export interface SessionEngagementSummaryInput {
  sessionId: string;
  committedReviewCount: number;
  uniqueCardsReviewedInSession: number;
  engagementResults: readonly EngagementProjectionResult[];
  dailyProgressAtCompletion: DailyProgress;
  streakAtCompletion: Streak;
  learningPointsBalance: number;
}
export interface SessionCelebration {
  celebrationId: string;
  sessionId: string;
  titleKey: 'review.summary.sessionComplete';
  reviewedWords: number;
  dailyProgress: { start: number; current: number; target: number; goalComplete: boolean; completedDuringSession: boolean };
  streak: { previous: number; current: number; state: 'safe' | 'at_risk' | 'broken' };
  rewards: { pointsEarnedInSession: number; dailyGoalBonus: number; totalLearningPoints: number };
  earnedMasteryCount: number;
  freezeEarned: boolean;
  intensity: 'standard' | 'goal_completed';
}

export function buildSessionCelebration(input: SessionEngagementSummaryInput): SessionCelebration {
  if (input.committedReviewCount < 1 || input.uniqueCardsReviewedInSession < 1) {
    throw new Error('Only completed non-empty sessions can create a celebration');
  }
  const sessionResults = input.engagementResults.filter(result =>
    result.rewardTransactions.some(transaction => transaction.sessionId === input.sessionId));
  const transactions = sessionResults.flatMap(result => result.rewardTransactions)
    .filter(transaction => transaction.sessionId === input.sessionId);
  const completedDuringSession = sessionResults.some(result => result.feedback?.kind === 'daily_goal_reached'
    || result.rewardTransactions.some(transaction => transaction.reason === 'daily_goal_completed'));
  const pointsEarnedInSession = transactions.reduce((total, transaction) => total + transaction.amount, 0);
  const dailyGoalBonus = transactions.filter(transaction => transaction.reason === 'daily_goal_completed')
    .reduce((total, transaction) => total + transaction.amount, 0);
  const earnedMasteryCount = transactions.filter(transaction => transaction.reason === 'earned_card_mastery').length;
  const firstResult = input.engagementResults[0];
  const firstReviewAddedCard = firstResult?.rewardTransactions.some(
    transaction => transaction.reason === 'first_daily_card_review' && transaction.sessionId === input.sessionId,
  ) ?? false;
  const dailyProgressAtStart = firstResult
    ? Math.max(0, firstResult.dailyProgress.uniqueCardsReviewed - (firstReviewAddedCard ? 1 : 0))
    : input.dailyProgressAtCompletion.uniqueCardsReviewed;
  const streakBeforeSession = completedDuringSession
    ? Math.max(0, input.streakAtCompletion.current - 1)
    : input.streakAtCompletion.current;
  return {
    celebrationId: `session-complete:${input.sessionId}`,
    sessionId: input.sessionId,
    titleKey: 'review.summary.sessionComplete',
    reviewedWords: input.uniqueCardsReviewedInSession,
    dailyProgress: {
      start: dailyProgressAtStart,
      current: input.dailyProgressAtCompletion.uniqueCardsReviewed,
      target: input.dailyProgressAtCompletion.targetUniqueCards,
      goalComplete: input.dailyProgressAtCompletion.uniqueCardsReviewed >= input.dailyProgressAtCompletion.targetUniqueCards,
      completedDuringSession,
    },
    streak: { previous: streakBeforeSession, current: input.streakAtCompletion.current, state: input.streakAtCompletion.state },
    rewards: { pointsEarnedInSession, dailyGoalBonus, totalLearningPoints: input.learningPointsBalance },
    earnedMasteryCount,
    freezeEarned: sessionResults.some(result => result.freezeEarned === true),
    intensity: completedDuringSession ? 'goal_completed' : 'standard',
  };
}
