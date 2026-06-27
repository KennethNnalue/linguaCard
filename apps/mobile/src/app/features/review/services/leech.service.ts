import { computed, inject, Injectable } from '@angular/core';
import type { Card } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { FsrsService } from '../../../shared/srs/fsrs.service';
import { isLeech } from '../../../shared/srs/srs-status';
import { ReviewStore } from '../store/review.store';
import { LocalReviewSession, MASTERY_THRESHOLD, MS_PER_DAY } from '../models/review.model';

/** A leech card enriched with a fail history derived from local sessions. */
export interface LeechEntry {
  card: Card;
  /** Failures (rating < Good) across all retained sessions. */
  failCount: number;
  /** Times this card was rated across all retained sessions. */
  seenCount: number;
  /** ISO timestamp of the most recent session that included this card. */
  lastSeenAt: string | null;
}

/** How long "Rest" snoozes a card before it becomes due again. */
const REST_SNOOZE_DAYS = 7;

/**
 * Leech detection + management. `isLeech` (srsState-only) decides membership;
 * this service enriches each leech with an actual fail-count from
 * `ReviewStore.sessionHistory()` (the data model has no per-card lapse counter).
 *
 * Reset/Rest are optimistic + locally durable via `CardStore.updateCard`
 * (IndexedDB). A server-authoritative reset/suspend endpoint does not exist yet,
 * so a future server `loadCards()` can overwrite these — durable server reset is
 * a backend follow-up.
 */
@Injectable({ providedIn: 'root' })
export class LeechService {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly fsrs = inject(FsrsService);

  readonly leeches = computed<LeechEntry[]>(() => {
    const sessions = this.reviewStore.sessionHistory();
    return this.cardStore
      .cards()
      .filter(isLeech)
      .map(card => this.enrich(card, sessions))
      .sort((a, b) => b.failCount - a.failCount || b.seenCount - a.seenCount);
  });

  readonly leechCount = computed(() => this.cardStore.cards().filter(isLeech).length);

  /** Card list for a "Break through all" session (strongest leeches first). */
  breakthroughQueue(): Card[] {
    return this.leeches().map(l => l.card);
  }

  /** Reset progress: card returns to the "new" pool. */
  reset(card: Card): void {
    const fresh = this.fsrs.freshState(card.id, card.userId);
    this.cardStore.updateCard({ ...card, srsState: fresh });
  }

  /** Snooze: push the next due date out so the card rests for a while. */
  rest(card: Card): void {
    const s = card.srsState;
    if (!s) return;
    const nextDueAt = new Date(Date.now() + REST_SNOOZE_DAYS * MS_PER_DAY).toISOString();
    this.cardStore.updateCard({ ...card, srsState: { ...s, nextDueAt } });
  }

  private enrich(card: Card, sessions: LocalReviewSession[]): LeechEntry {
    let failCount = 0;
    let seenCount = 0;
    let lastSeenAt: string | null = null;
    for (const s of sessions) {
      const rating = s.ratings[card.id];
      if (rating === undefined) continue;
      seenCount++;
      if (rating < MASTERY_THRESHOLD) failCount++;
      if (s.completedAt && (!lastSeenAt || s.completedAt > lastSeenAt)) {
        lastSeenAt = s.completedAt;
      }
    }
    return { card, failCount, seenCount, lastSeenAt };
  }
}
