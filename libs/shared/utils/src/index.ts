import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { ConfidenceRating, MasteryLevel, SRSStateData } from '@lingua-card/shared/domain';

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function isDue(nextDueAt: string): boolean {
  return new Date(nextDueAt) <= new Date();
}

// ─── FSRS CONSTANTS ───────────────────────────────────────────────────────────

export const MAX_INTERVAL_DAYS = 365;
export const TARGET_RETENTION = 0.9;

export const MASTERY_STABILITY_THRESHOLDS: Record<MasteryLevel, number> = {
  0: 0,
  1: 0,
  2: 7,
  3: 30,
  4: 90,
  5: 180,
};

// ─── FSRS SCHEDULER ───────────────────────────────────────────────────────────

const scheduler = fsrs({ request_retention: TARGET_RETENTION, maximum_interval: MAX_INTERVAL_DAYS });

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fsrsStateToSrsState(fsrsState: number, masteryLevel: MasteryLevel): SRSStateData['state'] {
  if (masteryLevel >= 5) return 'mastered';
  switch (fsrsState) {
    case 0: return 'new';
    case 1: return 'learning';
    case 3: return 'relearning';
    default: return 'review';
  }
}

function toFsrsCard(state: SRSStateData): FsrsCard {
  const now = new Date();
  const lastReview = state.lastReviewedAt ? new Date(state.lastReviewedAt) : undefined;

  if (state.stability != null && state.difficulty != null) {
    return {
      due: new Date(state.nextDueAt),
      stability: state.stability,
      difficulty: state.difficulty,
      elapsed_days: lastReview ? Math.floor((now.getTime() - lastReview.getTime()) / 86_400_000) : 0,
      scheduled_days: state.intervalDays,
      reps: 0,
      lapses: 0,
      state: state.state === 'new' ? 0 : state.state === 'learning' ? 1 : state.state === 'relearning' ? 3 : 2,
      last_review: lastReview,
    } as FsrsCard;
  }

  return createEmptyCard(lastReview ?? now);
}

// ─── FSRS ALGORITHM ───────────────────────────────────────────────────────────

export function computeFSRS(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
  if (rating < 1 || rating > 4) throw new Error(`computeFSRS: invalid rating ${rating} — must be 1–4`);
  const fsrsCard = toFsrsCard(state);
  const now = new Date();
  const result = scheduler.next(fsrsCard, now, rating as Grade);
  const next = result.card;

  const intervalDays = Math.min(next.scheduled_days, MAX_INTERVAL_DAYS);
  const stability = next.stability ?? state.stability ?? 1;
  const difficulty = next.difficulty ?? state.difficulty ?? 5;
  // Pass the due date so R is computed at the scheduled review time, not immediately after rating
  const rawR = scheduler.get_retrievability(next, next.due);
  const retrievability = rawR ? parseFloat(rawR) / 100 : null;
  const masteryLevel = stabilityToMastery(stability);

  return {
    ...state,
    algorithm: 'fsrs',
    intervalDays,
    nextDueAt: new Date(Date.now() + intervalDays * 86_400_000).toISOString(),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    stability,
    difficulty,
    retrievability,
    masteryLevel,
    state: fsrsStateToSrsState(next.state as unknown as number, masteryLevel),
    repetitions: state.repetitions + (rating >= 3 ? 1 : 0),
  };
}

export function previewFsrsIntervals(state: SRSStateData): Record<ConfidenceRating, number> {
  const fsrsCard = toFsrsCard(state);
  const now = new Date();
  const preview = scheduler.repeat(fsrsCard, now);

  return {
    1: previewDays(preview[Rating.Again].card, now),
    2: previewDays(preview[Rating.Hard].card, now),
    3: previewDays(preview[Rating.Good].card, now),
    4: previewDays(preview[Rating.Easy].card, now),
  };
}

function previewDays(card: FsrsCard, now: Date): number {
  if (card.scheduled_days > 0) return Math.min(card.scheduled_days, MAX_INTERVAL_DAYS);
  // Learning step: due is minutes away — return fraction of a day (minimum 1 minute = ~0.001d)
  const diffMs = card.due.getTime() - now.getTime();
  return diffMs > 0 ? diffMs / 86_400_000 : 0;
}

export function stabilityToMastery(stability: number | null): MasteryLevel {
  if (stability === null) return 0;
  if (stability >= 180) return 5;
  if (stability >= 90)  return 4;
  if (stability >= 30)  return 3;
  if (stability >= 7)   return 2;
  return 1;
}

export function freshFsrsState(cardId: string, userId: string, idFn: () => string = defaultUUID): SRSStateData {
  return {
    id: idFn(),
    cardId,
    userId,
    algorithm: 'fsrs',
    intervalDays: 1,
    nextDueAt: new Date().toISOString(),
    lastReviewedAt: null,
    lastRating: null,
    masteryLevel: 0,
    state: 'new',
    stability: null,
    difficulty: null,
    retrievability: null,
    easeFactor: 2.5,
    repetitions: 0,
  };
}

function defaultUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── LOCAL-TIME DATE UTILITIES ────────────────────────────────────────────────

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalWeek(d: Date): Date {
  const copy = new Date(d);
  const dow = copy.getDay();
  const diffToMonday = (dow + 6) % 7;
  copy.setDate(copy.getDate() - diffToMonday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b);
}

// ─── ARTICLE HELPERS ──────────────────────────────────────────────────────────

export function articleCssClass(article: string | null | undefined): string {
  if (!article) return '';
  return `article--${article}`;
}

export function masteryCssClass(level: MasteryLevel): string {
  return `mastery--${level}`;
}
