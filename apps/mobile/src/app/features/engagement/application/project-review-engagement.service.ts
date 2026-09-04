import { inject, Injectable } from '@angular/core';
import {
  applyReviewToDailyProgress, applyRewardPolicy, calculateStreak, DailyProgress, DEFAULT_REWARD_POLICY,
  EngagementProjectionResult, resolveEngagementDayKey, ReviewCommittedEvent, StreakDay,
} from '../domain/engagement-domain';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EngagementActivity, EngagementDashboard } from '../models/engagement-view.models';
import { buildEngagementDashboard } from './build-engagement-dashboard';
import { buildEngagementActivity } from './build-engagement-activity';
import { DAILY_STREAK_POLICY, dailyStreakReviewTarget, streakFreezeGrantMilestone } from '@lingua-card/shared/domain';
import { streakFreezeInventory } from '../domain/engagement-domain/streak/streak-freeze';

export interface ProjectReviewEngagementRequest {
  userId: string;
  timeZone: string;
  personalDailyGoal: number;
  eligibleCardCount: number;
  event: ReviewCommittedEvent;
  suppressTransientFeedback: boolean;
}

export interface ProjectReviewEngagementOutcome {
  result: EngagementProjectionResult;
  dashboard: EngagementDashboard;
  activity: EngagementActivity;
  duplicate: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProjectReviewEngagementService {
  private readonly repository = inject(EngagementLocalRepository);

  async project(request: ProjectReviewEngagementRequest): Promise<ProjectReviewEngagementOutcome> {
    const existing = await this.repository.state(request.userId);
    const previousResult = existing.projectionResults[request.event.eventId];
    if (previousResult) return {
      result: previousResult,
      dashboard: buildEngagementDashboard(
        existing,
        previousResult.dayKey,
        previousResult.dailyProgress.targetUniqueCards,
        request.personalDailyGoal,
      ),
      activity: buildEngagementActivity(existing, previousResult.dayKey, previousResult.dailyProgress.targetUniqueCards),
      duplicate: true,
    };

    const dayKey = resolveEngagementDayKey(request.event.reviewedAt, request.timeZone);
    const nextState = await this.repository.mutate(request.userId, state => {
      const duplicate = state.projectionResults[request.event.eventId];
      if (duplicate) return state;
      const current: DailyProgress = state.dailyProgress[dayKey] ?? {
        userId: request.userId,
        dayKey,
        streakPolicyVersion: DAILY_STREAK_POLICY.version,
        targetUniqueCards: dailyStreakReviewTarget(request.eligibleCardCount),
        reviewedCardIds: [], uniqueCardsReviewed: 0, committedReviewCount: 0,
      };
      const transition = applyReviewToDailyProgress(current, request.event, dayKey);
      const rewardTransactions = applyRewardPolicy({
        userId: request.userId, event: request.event, dailyProgressTransition: transition, dayKey,
        policy: DEFAULT_REWARD_POLICY, transactionId: reason => `${request.event.eventId}:${reason}`,
      });
      const existingDays = state.streakDays.filter(day => day.dayKey !== dayKey);
      const today: StreakDay = {
        dayKey, goalTarget: transition.next.targetUniqueCards,
        uniqueCardsReviewed: transition.next.uniqueCardsReviewed,
        status: transition.next.uniqueCardsReviewed >= transition.next.targetUniqueCards ? 'goal_met' : 'open',
      };
      const streakDays = [...existingDays, today].sort((left, right) => left.dayKey.localeCompare(right.dayKey));
      const streak = calculateStreak(streakDays, dayKey);
      const qualifyingGoalDayCount = streakDays.filter(day => day.status === 'goal_met').length;
      const freezeMilestone = transition.goalTransition === 'reached_now'
        ? streakFreezeGrantMilestone(qualifyingGoalDayCount, streakFreezeInventory(state.streakFreezeTransactions))
        : null;
      const freezeGrant = freezeMilestone === null ? null : {
        transactionId: `freeze-earned:${request.userId}:milestone:${freezeMilestone}`,
        userId: request.userId,
        occurredAt: new Date(request.event.reviewedAt.getTime()),
        amount: 1,
        reason: 'granted' as const,
        sourceId: `freeze-earned:${request.userId}:milestone:${freezeMilestone}`,
      };
      const feedback = transition.goalTransition === 'reached_now' && !request.suppressTransientFeedback
        ? { kind: 'daily_goal_reached' as const, feedbackId: `daily-goal-reached:${request.userId}:${dayKey}`,
          dayKey, current: transition.next.uniqueCardsReviewed, target: transition.next.targetUniqueCards,
          messageKey: 'review.engagement.dailyGoalComplete' as const }
        : undefined;
      const result: EngagementProjectionResult = {
        eventId: request.event.eventId, dayKey, dailyProgress: transition.next, streak, rewardTransactions,
        pointsAwarded: rewardTransactions.reduce((total, transaction) => total + transaction.amount, 0),
        freezeEarned: freezeGrant !== null,
        feedback,
      };
      return {
        ...state,
        processedEventDayKeys: { ...state.processedEventDayKeys, [request.event.eventId]: dayKey },
        projectionResults: { ...state.projectionResults, [request.event.eventId]: result },
        dailyProgress: { ...state.dailyProgress, [dayKey]: transition.next },
        streakDays,
        rewardTransactions: [...state.rewardTransactions, ...rewardTransactions.filter(transaction =>
          !state.rewardTransactions.some(existingTransaction => existingTransaction.deduplicationKey === transaction.deduplicationKey))],
        streakFreezeTransactions: freezeGrant
          ? [...state.streakFreezeTransactions, freezeGrant]
          : state.streakFreezeTransactions,
      };
    });
    const projectionResult = nextState.projectionResults[request.event.eventId];
    if (!projectionResult) throw new Error('Engagement projection did not produce a result');
    return {
      result: projectionResult,
      dashboard: buildEngagementDashboard(
        nextState,
        dayKey,
        projectionResult.dailyProgress.targetUniqueCards,
        request.personalDailyGoal,
      ),
      activity: buildEngagementActivity(nextState, dayKey, projectionResult.dailyProgress.targetUniqueCards),
      duplicate: false,
    };
  }

  async dashboard(userId: string, today: Date, timeZone: string, personalDailyGoal: number): Promise<EngagementDashboard> {
    const state = await this.repository.state(userId);
    const dayKey = resolveEngagementDayKey(today, timeZone);
    return buildEngagementDashboard(
      state,
      dayKey,
      DAILY_STREAK_POLICY.requiredUniqueReviews,
      personalDailyGoal,
    );
  }
}
