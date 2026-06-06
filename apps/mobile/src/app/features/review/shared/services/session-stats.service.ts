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
import type { LocalReviewSession } from '../../models/review.model';

@Injectable({ providedIn: 'root' })
export class SessionStatsService {
  private avgRatingNum(session: LocalReviewSession): number | null {
    const vals = Object.values(session.ratings) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  computeStats(session: LocalReviewSession): SessionStats {
    const ratings = Object.values(session.ratings) as number[];
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
      struggled: ratings.filter(r => r <= 2).length,
      nailed: ratings.filter(r => r === 4).length,
    };
  }

  /** Duration in human-readable "Xm Ys" format (used on hub / summary). */
  formatDuration(session: LocalReviewSession): string {
    if (!session.completedAt || !session.startedAt) return '—';
    const ms = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / SECONDS_PER_MINUTE);
    const sec = totalSecs % SECONDS_PER_MINUTE;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  avgRating(session: LocalReviewSession): string {
    const avg = this.avgRatingNum(session);
    return avg != null ? avg.toFixed(1) : '—';
  }

  ratingColour(session: LocalReviewSession): string {
    const avg = this.avgRatingNum(session);
    if (avg == null) return SESSION_COLOUR_NEUTRAL;
    if (avg >= RATING_GOOD_THRESHOLD) return SESSION_COLOUR_GOOD;
    if (avg >= RATING_OK_THRESHOLD) return SESSION_COLOUR_OK;
    return SESSION_COLOUR_BAD;
  }

  dotColour(session: LocalReviewSession): string {
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
