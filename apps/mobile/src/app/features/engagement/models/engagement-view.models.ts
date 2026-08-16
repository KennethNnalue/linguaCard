import { EngagementDayKey, Streak } from '../domain/engagement-domain';

export interface EngagementDashboard {
  today: { reviewed: number; goal: number; goalComplete: boolean };
  streak: Streak;
  learningPoints: number;
  streakFreezes: number;
  streakFreezeProgress: { daysTowardNext: number; interval: number; atCapacity: boolean };
}

export interface EngagementWeekDay {
  dayKey: EngagementDayKey;
  label: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
  heightPct: number;
}

export type EngagementDayViewStatus = 'goal_met' | 'protected_by_freeze' | 'missed' | 'open' | 'untracked';

export interface EngagementDayView {
  dayKey: EngagementDayKey;
  reviewed: number;
  goal: number;
  status: EngagementDayViewStatus;
}

export interface EngagementActivity {
  last7DaysGoalActivity: readonly boolean[];
  recentDays: readonly EngagementDayView[];
  weeklyData: readonly EngagementWeekDay[];
  weeklyTotal: number;
}

export type EngagementLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: { code: string; message: string; recoverable: boolean } };
