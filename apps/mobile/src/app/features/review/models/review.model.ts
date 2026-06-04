import type { Card, ConfidenceRating, MasteryLevel } from '@lingua-card/shared/domain';

// ─── SYNC OPERATION TYPES ────────────────────────────────────────────────────

export const SyncOperationType = {
  FLUSH_SRS_RATINGS: 'FLUSH_SRS_RATINGS',
} as const;

export type SyncOperationType = (typeof SyncOperationType)[keyof typeof SyncOperationType];

// ─── MASTERY ──────────────────────────────────────────────────────────────────

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  0: 'New',
  1: 'Beginner',
  2: 'Learning',
  3: 'Familiar',
  4: 'Good',
  5: 'Mastered',
};

export const MASTERY_COLOURS: Record<MasteryLevel, string> = {
  0: '#D1D5DB',
  1: '#FCA5A5',
  2: '#FCD34D',
  3: '#6EE7B7',
  4: '#34D399',
  5: '#059669',
};

export interface MasteryInfo {
  level: MasteryLevel;
  label: string;
  colour: string;
}

export const MASTERY_INFO: MasteryInfo[] = [
  { level: 0, label: MASTERY_LABELS[0], colour: MASTERY_COLOURS[0] },
  { level: 1, label: MASTERY_LABELS[1], colour: MASTERY_COLOURS[1] },
  { level: 2, label: MASTERY_LABELS[2], colour: MASTERY_COLOURS[2] },
  { level: 3, label: MASTERY_LABELS[3], colour: MASTERY_COLOURS[3] },
  { level: 4, label: MASTERY_LABELS[4], colour: MASTERY_COLOURS[4] },
  { level: 5, label: MASTERY_LABELS[5], colour: MASTERY_COLOURS[5] },
];

export const MASTERY_INFO_DESC: MasteryInfo[] = [...MASTERY_INFO].reverse();

// ─── CONFIDENCE RATINGS ───────────────────────────────────────────────────────

export const RATING_LABELS: Record<ConfidenceRating, string> = {
  0: 'Blank',
  1: 'Hard',
  2: 'Hmm',
  3: 'Good',
  4: 'Easy',
  5: 'Nailed',
};

export interface RatingOption {
  value: ConfidenceRating;
  label: string;
}

export const RATING_OPTIONS: RatingOption[] = [
  { value: 0, label: RATING_LABELS[0] },
  { value: 1, label: RATING_LABELS[1] },
  { value: 2, label: RATING_LABELS[2] },
  { value: 3, label: RATING_LABELS[3] },
  { value: 4, label: RATING_LABELS[4] },
  { value: 5, label: RATING_LABELS[5] },
];

// Threshold below which a card is considered "not mastered" in a session
export const MASTERY_THRESHOLD: ConfidenceRating = 3;

// ─── SESSION HISTORY LIMITS ───────────────────────────────────────────────────

export const MAX_SESSION_HISTORY = 50;

// ─── REVIEW SORT ORDER ────────────────────────────────────────────────────────

export const ReviewSortOrder = {
  HARDEST: 'hardest',
  OLDEST: 'oldest',
  RANDOM: 'random',
  DUE_DATE: 'due_date',
  MOST_LAPSES: 'most_lapses',
} as const;

export type ReviewSortOrder = (typeof ReviewSortOrder)[keyof typeof ReviewSortOrder];

export interface SortOption {
  value: ReviewSortOrder;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: ReviewSortOrder.HARDEST, label: 'Hardest first' },
  { value: ReviewSortOrder.OLDEST, label: 'Oldest first' },
  { value: ReviewSortOrder.RANDOM, label: 'Random' },
  { value: ReviewSortOrder.DUE_DATE, label: 'Due date' },
];

// ─── REVIEW SOURCE ────────────────────────────────────────────────────────────

export const ReviewSource = {
  ALL: 'all',
} as const;

export type ReviewSourceValue = typeof ReviewSource.ALL | string;

// ─── REVIEW FILTERS ───────────────────────────────────────────────────────────

export interface ReviewFilters {
  source: ReviewSourceValue;
  masteryLevels: MasteryLevel[];
  sortOrder: ReviewSortOrder;
  limit: number;
}

// ─── REVIEW PRESET ────────────────────────────────────────────────────────────

export const ReviewPresetId = {
  DUE_TODAY: 'due-today',
  STRUGGLING: 'struggling',
  NEW_ONLY: 'new-only',
} as const;

export type ReviewPresetId = (typeof ReviewPresetId)[keyof typeof ReviewPresetId];

export interface ReviewPreset {
  id: ReviewPresetId;
  label: string;
  description: string;
  iconName: string;
  colour: string;
  filters: ReviewFilters;
}

// ─── REVIEW LIMITS ────────────────────────────────────────────────────────────

export const ReviewLimit = {
  DUE_TODAY: 50,
  STRUGGLING: 30,
  NEW_ONLY: 20,
  MASTERY_LEVEL: 50,
  CUSTOM_DEFAULT: 30,
  CUSTOM_MAX: 9999,
} as const;

// ─── SESSION FILTER PERIOD ────────────────────────────────────────────────────

export const FilterPeriod = {
  ALL: 'all',
  WEEK: 'week',
  MONTH: 'month',
} as const;

export type FilterPeriod = (typeof FilterPeriod)[keyof typeof FilterPeriod];

export const FILTER_PERIOD_DAYS: Record<Exclude<FilterPeriod, 'all'>, number> = {
  week: 7,
  month: 30,
};

// ─── SESSION STATS ────────────────────────────────────────────────────────────

export interface SessionStats {
  totalCards: number;
  duration: string;
  avgRating: string;
  struggled: number;
  nailed: number;
}

// ─── RATING PILL CSS CLASS THRESHOLDS ────────────────────────────────────────

export const RatingPillClass = {
  GREEN: 'pill--green',
  AMBER: 'pill--amber',
  RED: 'pill--red',
  NEUTRAL: 'pill--neutral',
} as const;

export type RatingPillClass = (typeof RatingPillClass)[keyof typeof RatingPillClass];

export const RATING_GOOD_THRESHOLD = 4.0;
export const RATING_OK_THRESHOLD = 3.0;

// ─── SESSION COLOUR THRESHOLDS ────────────────────────────────────────────────

export const SESSION_COLOUR_GOOD = '#059669';
export const SESSION_COLOUR_OK = '#D97706';
export const SESSION_COLOUR_BAD = '#B91C1C';
export const SESSION_COLOUR_NEUTRAL = '#6B7280';

export const SESSION_DOT_GOOD = '#059669';
export const SESSION_DOT_OK = '#6EE7B7';
export const SESSION_DOT_WARN = '#FCD34D';
export const SESSION_DOT_BAD = '#FCA5A5';
export const SESSION_DOT_EMPTY = '#D1D5DB';

// ─── RING CHART CONSTANTS ─────────────────────────────────────────────────────

export const RING_RADIUS_OUTER = 28;
export const RING_RADIUS_INNER = 26;
export const RING_CIRCUMFERENCE_OUTER = 2 * Math.PI * RING_RADIUS_OUTER;
export const RING_CIRCUMFERENCE_INNER = 2 * Math.PI * RING_RADIUS_INNER;

// ─── REVIEW SESSION (LOCAL / FEATURE) ────────────────────────────────────────

export interface LocalReviewSession {
  id: string;
  startedAt: string;
  completedAt: string | null;
  totalCards: number;
  ratings: Record<string, ConfidenceRating>;
  collectionId: string | null;
  collectionName: string | null;
  reviewedCards: Card[];
}

/**
 * Returns the set of card IDs rated in a session.
 * Prefers reviewedCards (full objects) when hydrated; falls back to ratings
 * keys, which are always persisted and survive app restarts even when card
 * hydration hasn't completed yet.
 */
export function sessionCardIds(session: LocalReviewSession): string[] {
  return (session.reviewedCards?.length ?? 0) > 0
    ? session.reviewedCards.map(c => c.id)
    : Object.keys(session.ratings);
}

// ─── REVIEW QUERY PARAMS ──────────────────────────────────────────────────────

export const ReviewQueryParam = {
  COLLECTION_ID: 'collectionId',
  MODE: 'mode',
  CARD_IDS: 'cardIds',
} as const;

export const ReviewMode = {
  RETRY: 'retry',
  ALL: 'all',
} as const;

export type ReviewMode = (typeof ReviewMode)[keyof typeof ReviewMode];

// ─── NAVIGATION ROUTES ────────────────────────────────────────────────────────

export const ReviewRoute = {
  HUB: '/review',
  PLAYER: '/review/player',
  SUMMARY: '/review/summary',
  STRUGGLING: '/review/struggling',
  CUSTOM: '/review/custom',
  HISTORY: '/review/history',
  MASTERY: '/review/mastery',
} as const;

export type ReviewRoute = (typeof ReviewRoute)[keyof typeof ReviewRoute];

// ─── BREAKDOWN TAG LABELS ─────────────────────────────────────────────────────

export const BreakdownTagLabel = {
  NEW: 'new',
  HARD: 'hard',
  LEARNING: 'learning',
  REVIEW: 'review',
} as const;

export type BreakdownTagLabel = (typeof BreakdownTagLabel)[keyof typeof BreakdownTagLabel];

export interface BreakdownTag {
  label: BreakdownTagLabel;
  count: number;
  colour: string;
}

// ─── STRUGGLING CARD THRESHOLDS ───────────────────────────────────────────────

// Cards at Beginner or Learning (levels 1–2) that have been reviewed at least once
export const STRUGGLING_MASTERY_MAX: MasteryLevel = 2;
export const STRUGGLING_FAIL_BADGE_RED_THRESHOLD = 4;

// ─── ARTICLE GENDER MAP ───────────────────────────────────────────────────────

export const ARTICLE_GENDER_MAP: Record<string, string> = {
  der: 'masculine',
  die: 'feminine',
  das: 'neuter',
};

// ─── TIME CONSTANTS (ms) ─────────────────────────────────────────────────────

export const MS_PER_DAY = 86_400_000;
export const MS_PER_SECOND = 1_000;
export const SECONDS_PER_MINUTE = 60;
