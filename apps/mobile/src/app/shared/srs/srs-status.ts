import type { Card } from '@lingua-card/shared/domain';

/**
 * Canonical SRS lifecycle selectors — single source of truth for every
 * "new / due / mastered / struggling" decision in the app.
 *
 * Rule: "new" means never studied (no srsState, or lastReviewedAt is null).
 * masteryLevel === 0 alone is NOT "new" — a failed card resets to level 0
 * but has been studied.
 */

export function isNew(card: Card): boolean {
  return !card.srsState || card.srsState.lastReviewedAt === null;
}

export function isDue(card: Card, now: Date): boolean {
  const s = card.srsState;
  return !!s && s.lastReviewedAt !== null && new Date(s.nextDueAt) <= now;
}

/**
 * Mastered = masteryLevel 5. Single threshold used everywhere.
 * (API buildCountsMap uses state === 'mastered', which is set when
 * masteryLevel >= 4; RV09 will reconcile the server side.)
 */
export function isMastered(card: Card): boolean {
  return (card.srsState?.masteryLevel ?? 0) === 5;
}

/**
 * Leech = a studied card you keep failing. The data model has no lapse counter,
 * so this is a srsState-only heuristic: the card is in FSRS `relearning` (it was
 * failed and is being re-learned), or it is struggling (low mastery) with high
 * intrinsic FSRS difficulty. The Leeches page enriches this with an actual
 * fail-count derived from local session history.
 */
export function isLeech(card: Card): boolean {
  const s = card.srsState;
  if (!s || s.lastReviewedAt === null) return false;
  const level = s.masteryLevel ?? 0;
  const struggling = level >= 1 && level <= 2;
  const hardFsrs = (s.difficulty ?? 0) >= 7;
  return s.state === 'relearning' || (struggling && hardFsrs);
}

/**
 * Struggling = studied at least once, low mastery (1–2), with repetitions > 0.
 * Level 0 after a failure is excluded because the card may simply be new.
 */
export function isStruggling(card: Card): boolean {
  const s = card.srsState;
  if (!s || s.lastReviewedAt === null) return false;
  const level = s.masteryLevel ?? 0;
  return s.repetitions > 0 && level >= 1 && level <= 2;
}

export type CardLifecycleState = 'new' | 'learning' | 'review' | 'mastered';

export function lifecycleState(card: Card): CardLifecycleState {
  const s = card.srsState;
  if (!s || s.lastReviewedAt === null) return 'new';
  if (isMastered(card)) return 'mastered';
  // Use the FSRS state string when available; fall back to interval heuristic.
  if (s.state === 'learning' || s.state === 'relearning' || s.intervalDays <= 7) return 'learning';
  return 'review';
}
