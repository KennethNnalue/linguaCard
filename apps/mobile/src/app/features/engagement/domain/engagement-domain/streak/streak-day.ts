import { EngagementDayKey } from '../shared/engagement-date';

export type StreakDayStatus = 'goal_met' | 'protected_by_freeze' | 'missed' | 'open';
export interface StreakDay {
  dayKey: EngagementDayKey;
  goalTarget: number;
  uniqueCardsReviewed: number;
  status: StreakDayStatus;
  freezeTransactionId?: string;
}
