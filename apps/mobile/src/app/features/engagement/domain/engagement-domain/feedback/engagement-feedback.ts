import { EngagementDayKey } from '../shared/engagement-date';

export interface DailyGoalReachedFeedback {
  kind: 'daily_goal_reached';
  feedbackId: string;
  dayKey: EngagementDayKey;
  current: number;
  target: number;
  messageKey: 'review.engagement.dailyGoalComplete';
}
