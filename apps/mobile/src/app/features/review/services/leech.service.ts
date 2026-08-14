import { computed, inject, Injectable } from '@angular/core';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import { isLeech } from '../domain/review-status';
import { ReviewStore } from '../store/review.store';
import { ReviewSessionHistoryEntry } from '../models/review.model';
import { CardAdministrationService } from './card-administration.service';

/** A leech card enriched with a fail history derived from local sessions. */
export interface LeechEntry {
  card: ScheduledCard;
  /** Failures (rating < Good) across all retained sessions. */
  failCount: number;
  /** Times this card was rated across all retained sessions. */
  seenCount: number;
  /** ISO timestamp of the most recent session that included this card. */
  lastSeenAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class LeechService {
  private readonly cardStore = inject(CardStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly administration = inject(CardAdministrationService);

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
  breakthroughQueue(): ScheduledCard[] {
    return this.leeches().map(l => l.card);
  }

  async reset(card: ScheduledCard): Promise<void> {
    await this.administration.resetProgress(card);
  }

  async rest(card: ScheduledCard): Promise<void> {
    await this.administration.scheduleLeechRest(card);
  }

  private enrich(card: ScheduledCard, sessions: ReviewSessionHistoryEntry[]): LeechEntry {
    let failCount = 0;
    let seenCount = 0;
    let lastSeenAt: string | null = null;
    for (const s of sessions) {
      const rating = s.ratings[card.id];
      if (rating === undefined) continue;
      seenCount++;
      if (rating === 'again' || rating === 'hard') failCount++;
      if (s.completedAt && (!lastSeenAt || s.completedAt > lastSeenAt)) {
        lastSeenAt = s.completedAt;
      }
    }
    return { card, failCount, seenCount, lastSeenAt };
  }
}
