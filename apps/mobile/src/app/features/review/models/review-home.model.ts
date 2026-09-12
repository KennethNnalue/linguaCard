import type {ReviewSessionPlan} from '../application/review-session-planning.service';
import type {ReviewAutoplayMode} from '../application/review-audio-policy';
import type {StudyMode} from '../services/review-prefs.service';

export interface ReviewPreferenceSummary {
  mode: StudyMode;
  autoplay: ReviewAutoplayMode;
}

export interface ReviewHomeDashboard {
  completedToday: number;
  goal: number;
  streak: number;
  preferences: ReviewPreferenceSummary;
}

export type ReviewHomeContinuation =
  | {kind: 'ready'; plan: ReviewSessionPlan}
  | {kind: 'none'}
  | {kind: 'error'};

export type ReviewHomeViewModel =
  | {kind: 'loading'}
  | {kind: 'error'}
  | {
      kind: 'resume';
      sessionId: string;
      remainingCards: number;
      estimatedMinutes: number;
      sessionProgress: number;
    }
  | {kind: 'empty'}
  | {
      kind: 'complete';
      reviewedToday: number;
      goal: number;
      continuation: ReviewHomeContinuation;
    }
  | {
      kind: 'ready';
      plan: ReviewSessionPlan;
    }
  | {kind: 'nothing-eligible'};
