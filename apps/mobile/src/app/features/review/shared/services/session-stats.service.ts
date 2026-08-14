import { Injectable } from '@angular/core';
import {
  RATING_GOOD_THRESHOLD,
  RATING_OK_THRESHOLD,
  RatingPillClass,
  SECONDS_PER_MINUTE,
  SESSION_COLOUR_BAD,
  SESSION_COLOUR_GOOD,
  SESSION_COLOUR_NEUTRAL,
  SESSION_COLOUR_OK,
  SESSION_DOT_BAD,
  SESSION_DOT_EMPTY,
  SESSION_DOT_GOOD,
  SESSION_DOT_OK,
  SESSION_DOT_WARN,
  SessionStats,
} from '../../models/review.model';
import type { ReviewSessionHistoryEntry } from '../../models/review.model';

@Injectable({ providedIn: 'root' })
export class SessionStatsService {
  private readonly scores = { again: 1, hard: 2, good: 3, easy: 4 } as const;

  private avgRatingNum(session: ReviewSessionHistoryEntry): number | null {
    const vals = Object.values(session.ratings).map(rating => this.scores[rating]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  computeStats(session: ReviewSessionHistoryEntry): SessionStats {
    const ratings = Object.values(session.ratings);
    const avg = this.avgRatingNum(session);

    const ms = session.completedAt
      ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
      : 0;
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / SECONDS_PER_MINUTE);
    const s = totalSecs % SECONDS_PER_MINUTE;
    const duration = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;

    return {
      // Use actual ratings count — cards in queue but not yet rated don't count
      totalCards: ratings.length || session.totalCards,
      duration,
      avgRating: avg != null ? avg.toFixed(1) : '–',
      struggled: ratings.filter(r => r === 'again' || r === 'hard').length,
      nailed: ratings.filter(r => r === 'good' || r === 'easy').length,
    };
  }

  /** Cards recalled well (rated Good or Easy) — the "Nailed" stat. */
  nailed(session: ReviewSessionHistoryEntry): number {
    return Object.values(session.ratings).filter(r => r === 'good' || r === 'easy').length;
  }

  /** Cards failed (rated Again or Hard) — the "Struggled" stat. */
  struggled(session: ReviewSessionHistoryEntry): number {
    return Object.values(session.ratings).filter(r => r === 'again' || r === 'hard').length;
  }

  /** Recall rate 0–100 across a session (recalled / rated). */
  recallRate(session: ReviewSessionHistoryEntry): number {
    const total = Object.values(session.ratings).length;
    if (!total) return 0;
    return Math.round((this.nailed(session) / total) * 100);
  }

  /** Duration in human-readable "Xm Ys" format (used on hub / summary). */
  formatDuration(session: ReviewSessionHistoryEntry): string {
    if (!session.completedAt || !session.startedAt) return '—';
    const ms = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / SECONDS_PER_MINUTE);
    const sec = totalSecs % SECONDS_PER_MINUTE;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  avgRating(session: ReviewSessionHistoryEntry): string {
    const avg = this.avgRatingNum(session);
    return avg != null ? avg.toFixed(1) : '—';
  }

  ratingColour(session: ReviewSessionHistoryEntry): string {
    const avg = this.avgRatingNum(session);
    if (avg == null) return SESSION_COLOUR_NEUTRAL;
    if (avg >= RATING_GOOD_THRESHOLD) return SESSION_COLOUR_GOOD;
    if (avg >= RATING_OK_THRESHOLD) return SESSION_COLOUR_OK;
    return SESSION_COLOUR_BAD;
  }

  dotColour(session: ReviewSessionHistoryEntry): string {
    const avg = this.avgRatingNum(session);
    if (avg == null) return SESSION_DOT_EMPTY;
    if (avg >= RATING_GOOD_THRESHOLD) return SESSION_DOT_GOOD;
    if (avg >= RATING_OK_THRESHOLD) return SESSION_DOT_OK;
    if (avg >= 2) return SESSION_DOT_WARN;
    return SESSION_DOT_BAD;
  }

  pillClass(avgRating: string): RatingPillClass {
    const n = parseFloat(avgRating);
    if (isNaN(n)) return RatingPillClass.NEUTRAL;
    if (n >= RATING_GOOD_THRESHOLD) return RatingPillClass.GREEN;
    if (n >= RATING_OK_THRESHOLD) return RatingPillClass.AMBER;
    return RatingPillClass.RED;
  }
}
