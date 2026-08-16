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
  dailyProgress: { current: number; target: number; goalComplete: boolean; completedDuringSession: boolean };
  streak: { current: number; state: 'safe' | 'at_risk' | 'broken' };
  rewards: { pointsEarnedInSession: number; dailyGoalBonus: number; totalLearningPoints: number };
  earnedMasteryCount: number;
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
  return {
    celebrationId: `session-complete:${input.sessionId}`,
    sessionId: input.sessionId,
    titleKey: 'review.summary.sessionComplete',
    reviewedWords: input.uniqueCardsReviewedInSession,
    dailyProgress: {
      current: input.dailyProgressAtCompletion.uniqueCardsReviewed,
      target: input.dailyProgressAtCompletion.targetUniqueCards,
      goalComplete: input.dailyProgressAtCompletion.uniqueCardsReviewed >= input.dailyProgressAtCompletion.targetUniqueCards,
      completedDuringSession,
    },
    streak: { current: input.streakAtCompletion.current, state: input.streakAtCompletion.state },
    rewards: { pointsEarnedInSession, dailyGoalBonus, totalLearningPoints: input.learningPointsBalance },
    earnedMasteryCount,
    intensity: completedDuringSession ? 'goal_completed' : 'standard',
  };
}
