import type { LearningStage, ReviewRating } from '@lingua-card/shared/domain';

// ─── SYNC OPERATION TYPES ────────────────────────────────────────────────────

export const SyncOperationType = {
  FLUSH_REVIEW_COMMITS: 'FLUSH_REVIEW_COMMITS',
  FLUSH_REVIEW_SESSIONS: 'FLUSH_REVIEW_SESSIONS',
  PATCH_SETTINGS: 'PATCH_SETTINGS',
} as const;

export type SyncOperationType = (typeof SyncOperationType)[keyof typeof SyncOperationType];

// ─── MASTERY ──────────────────────────────────────────────────────────────────

export const MASTERY_LABEL_KEYS: Record<LearningStage, string> = {
  new: 'srs.masteryLabel.new',
  learning: 'srs.masteryLabel.learning',
  familiar: 'srs.masteryLabel.familiar',
  strong: 'srs.masteryLabel.good',
  mastered: 'srs.masteryLabel.mastered',
};

export const MASTERY_LABELS: Record<LearningStage, string> = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  strong: 'Strong',
  mastered: 'Mastered',
};

// Warm lifecycle palette (Review redesign). Used as SVG stroke / chart fills —
// the one sanctioned raw-hex location (SCSS tokens can't reach SVG strokes).
// New → Mastered: warm grey → amber → brass → sage → mid-green → forest.
export const MASTERY_COLOURS: Record<LearningStage, string> = {
  new: '#B0A593',
  learning: '#C99A3E',
  familiar: '#D8B981',
  strong: '#3E7A5E',
  mastered: '#2E6B52',
};

export interface MasteryInfo {
  level: LearningStage;
  label: string;
  colour: string;
}

export const MASTERY_INFO: MasteryInfo[] = [
  { level: 'new', label: MASTERY_LABELS.new, colour: MASTERY_COLOURS.new },
  { level: 'learning', label: MASTERY_LABELS.learning, colour: MASTERY_COLOURS.learning },
  { level: 'familiar', label: MASTERY_LABELS.familiar, colour: MASTERY_COLOURS.familiar },
  { level: 'strong', label: MASTERY_LABELS.strong, colour: MASTERY_COLOURS.strong },
  { level: 'mastered', label: MASTERY_LABELS.mastered, colour: MASTERY_COLOURS.mastered },
];

export const MASTERY_INFO_DESC: MasteryInfo[] = [...MASTERY_INFO].reverse();

// ─── REVIEW RATINGS ──────────────────────────────────────────────────────────

export const RATING_LABELS: Record<ReviewRating, string> = {
  again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy',
};

export const RATING_DESCRIPTIONS: Record<ReviewRating, string> = {
  again: 'Completely forgot', hard: 'Recalled with effort', good: 'Recalled correctly', easy: 'Recalled instantly',
};

export interface RatingOption {
  value: ReviewRating;
  label: string;
  description: string;
  /** Next interval in integer minutes. */
  previewMinutes?: number | null;
  /** Formatted label, e.g. "8d", "10min", "2hr" */
  previewLabel?: string | null;
}

export function formatPreviewInterval(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.max(1, minutes)}min`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}hr`;
  return `${Math.round(minutes / 1_440)}d`;
}

export const RATING_OPTIONS: RatingOption[] = [
  { value: 'again', label: 'Again', description: 'Completely forgot' },
  { value: 'hard', label: 'Hard', description: 'Recalled with effort' },
  { value: 'good', label: 'Good', description: 'Recalled correctly' },
  { value: 'easy', label: 'Easy', description: 'Recalled instantly' },
];

export function buildRatingOptionsWithPreviews(
  previews: Record<ReviewRating, number>,
): RatingOption[] {
  return RATING_OPTIONS.map(opt => ({
    ...opt,
    previewMinutes: previews[opt.value],
    previewLabel: formatPreviewInterval(previews[opt.value]),
  }));
}

export const RATING_OPTIONS_NO_PREVIEW: RatingOption[] = RATING_OPTIONS.map(opt => ({
  ...opt,
  previewMinutes: null,
  previewLabel: null,
}));

// Threshold: ratings below this reset progress (Again=1, Hard=2 both fail)
export const SUCCESSFUL_REVIEW_RATINGS: readonly ReviewRating[] = ['good', 'easy'];

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
  stages: LearningStage[];
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

// Calibrated for the 1–4 review scale.
export const RATING_GOOD_THRESHOLD = 3.0;
export const RATING_OK_THRESHOLD = 2.0;

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

// ─── REVIEW SESSION HISTORY ──────────────────────────────────────────────────

export interface ReviewSessionHistoryEntry {
  id: string;
  startedAt: string;
  completedAt: string;
  totalCards: number;
  newCards: number;
  ratings: Record<string, ReviewRating>;
  collectionId: string | null;
  collectionName: string | null;
  originalCardIds: readonly string[];
  reviewedCardIds: readonly string[];
}

// ─── NAVIGATION ROUTES ────────────────────────────────────────────────────────

export const ReviewRoute = {
  HUB: '/review',
  PLAYER: '/review/player',
  SUMMARY: '/review/summary',
  STRUGGLING: '/review/struggling',
  CUSTOM: '/review/custom',
  HISTORY: '/review/history',
  PROGRESS: '/review/progress',
  MASTERY: '/review/mastery',
  LEECHES: '/review/leeches',
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

// Rough study-time estimate for the hub "≈ N min" hint (~5s per card).
export const MINUTES_PER_CARD_REVIEW = 0.08;
