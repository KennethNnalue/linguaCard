import { Streak } from '../domain/engagement-domain';

export interface EngagementDashboard {
  today: { reviewed: number; goal: number; goalComplete: boolean };
  streak: Streak;
  learningPoints: number;
  streakFreezes: number;
}

export interface EngagementWeekDay {
  dayKey: string;
  label: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
  heightPct: number;
}

export interface EngagementActivity {
  last7DaysGoalActivity: readonly boolean[];
  weeklyData: readonly EngagementWeekDay[];
  weeklyTotal: number;
}

export type EngagementLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: { code: string; message: string; recoverable: boolean } };
