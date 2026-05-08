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

export interface SM2Result {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  masteryLevel: MasteryLevel;
  state: SRSStateData['state'];
  nextDueAt: string;
}

export function computeSM2(state: SRSStateData, rating: ConfidenceRating): SM2Result {
  let { intervalDays, easeFactor, repetitions } = state;

  if (rating < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));

  const masteryLevel = repetitionsToMastery(repetitions, rating);
  const srsState = masteryLevel === 5 ? 'mastered' : repetitions === 0 ? 'new' : intervalDays <= 7 ? 'learning' : 'review';

  return {
    intervalDays,
    easeFactor,
    repetitions,
    masteryLevel,
    state: srsState as SRSStateData['state'],
    nextDueAt: daysFromNow(intervalDays),
  };
}

function repetitionsToMastery(repetitions: number, lastRating: ConfidenceRating): MasteryLevel {
  if (repetitions === 0) return 0;
  if (lastRating <= 1) return 1;
  if (repetitions <= 2) return 2;
  if (repetitions <= 4) return 3;
  if (repetitions <= 7) return 4;
  return 5;
}

// ─── ARTICLE HELPERS ──────────────────────────────────────────────────────────

export function articleCssClass(article: string | null | undefined): string {
  if (!article) return '';
  return `article--${article}`;
}

export function masteryCssClass(level: MasteryLevel): string {
  return `mastery--${level}`;
}
