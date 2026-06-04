import type { SRSStateData, ConfidenceRating, MasteryLevel } from '@lingua-card/shared/domain';

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

// ─── SM-2 ALGORITHM ───────────────────────────────────────────────────────────

/**
 * Canonical SM-2 implementation. Both the mobile Sm2Service and the NestJS
 * CardsService import this function — there is exactly one algorithm.
 *
 * masteryLevel = floor(repetitions / 2), capped at 5.
 * state string: 'new' when rep=0, 'mastered' when masteryLevel>=4, otherwise
 * 'learning' (rep<=2) or 'review'.
 */
export function computeSM2(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
  let { intervalDays, easeFactor, repetitions } = state;

  if (rating < 3) {
    repetitions = 0;
    intervalDays = rating === 0 ? 1 : 2;
    easeFactor = Math.max(1.3, easeFactor - (rating === 0 ? 0.2 : 0.15));
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    const easeAdjust = 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02);
    easeFactor = Math.max(1.3, easeFactor + easeAdjust);
  }

  const masteryLevel = Math.min(5, Math.floor(repetitions / 2)) as MasteryLevel;
  const nextDueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
  const srsState =
    repetitions === 0 ? 'new'
    : masteryLevel >= 4 ? 'mastered'
    : repetitions <= 2 ? 'learning'
    : 'review';

  return {
    ...state,
    intervalDays,
    easeFactor,
    repetitions,
    lastRating: rating,
    lastReviewedAt: new Date().toISOString(),
    nextDueAt,
    masteryLevel,
    state: srsState as SRSStateData['state'],
  };
}

export function freshSrsState(cardId: string, userId: string, idFn: () => string = defaultUUID): SRSStateData {
  return {
    id: idFn(),
    cardId,
    userId,
    algorithm: 'sm2',
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 0,
    lastRating: null,
    lastReviewedAt: null,
    nextDueAt: new Date().toISOString(),
    masteryLevel: 0,
    state: 'new',
  };
}

function defaultUUID(): string {
  // Works in both browser (Web Crypto API) and Node 14.17+
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── LOCAL-TIME DATE UTILITIES ────────────────────────────────────────────────

/**
 * Returns a YYYY-MM-DD string in the **local** timezone (not UTC).
 * Use this everywhere day-bucketing is needed so streak, weekly chart, and
 * "completed today" all agree regardless of the user's UTC offset.
 */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns midnight (00:00:00) of the Monday that begins the week containing `d`. */
export function startOfLocalWeek(d: Date): Date {
  const copy = new Date(d);
  const dow = copy.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diffToMonday = (dow + 6) % 7;   // Mon=0
  copy.setDate(copy.getDate() - diffToMonday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** True when two dates fall on the same local calendar day. */
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
