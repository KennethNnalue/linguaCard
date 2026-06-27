import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, refreshOutline, sparklesOutline } from 'ionicons/icons';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../store/review.store';
import { CardStore } from '../../../vault/store/card.store';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { ReviewStatsStore } from '../../../../shared/srs/review-stats.store';
import { MASTERY_THRESHOLD, ReviewRoute } from '../../models/review.model';

interface RatingBar {
  value: ConfidenceRating;
  labelKey: string;
  cls: string;
  count: number;
  percent: number;
}

const RATING_BAR_KEY: Record<ConfidenceRating, string> = {
  1: 'review.rating.again',
  2: 'review.rating.hard',
  3: 'review.rating.good',
  4: 'review.rating.easy',
};
const RATING_BAR_CLS: Record<ConfidenceRating, string> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
};

@Component({
  selector: 'lc-session-summary',
  templateUrl: './session-summary.page.html',
  styleUrls: ['./session-summary.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, TranslatePipe],
})
export class SessionSummaryPage implements OnInit {
  private readonly reviewStore = inject(ReviewStore);
  private readonly cardStore = inject(CardStore);
  private readonly router = inject(Router);
  private readonly statsService = inject(SessionStatsService);
  private readonly reviewStats = inject(ReviewStatsStore);

  constructor() {
    addIcons({ checkmarkOutline, refreshOutline, sparklesOutline });
  }

  readonly session = this.reviewStore.completedSession;
  readonly dayStreak = this.reviewStats.dayStreak;

  ngOnInit(): void {
    if (!this.session()) {
      void this.router.navigate([ReviewRoute.HUB], { replaceUrl: true });
    }
  }

  readonly reviewedCount = computed(() => {
    const s = this.session();
    return s ? Object.keys(s.ratings).length : 0;
  });

  readonly duration = computed(() => {
    const s = this.session();
    return s ? this.statsService.formatDuration(s) : '—';
  });

  readonly recallRate = computed(() => {
    const s = this.session();
    return s ? this.statsService.recallRate(s) : 0;
  });

  readonly ratingBreakdown = computed<RatingBar[]>(() => {
    const s = this.session();
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    if (s) {
      Object.values(s.ratings).forEach(r => { counts[r as number]++; });
    }
    const maxCount = Math.max(...Object.values(counts), 1);
    return ([4, 3, 2, 1] as ConfidenceRating[]).map(v => ({
      value: v,
      labelKey: RATING_BAR_KEY[v],
      cls: RATING_BAR_CLS[v],
      count: counts[v],
      percent: Math.round((counts[v] / maxCount) * 100),
    }));
  });

  private readonly nonMasteredCards = computed((): Card[] => {
    const s = this.session();
    if (!s) return [];
    return s.reviewedCards.filter(c => (s.ratings[c.id] ?? 4) < MASTERY_THRESHOLD);
  });

  readonly tricky = computed(() => this.nonMasteredCards().length);
  readonly hasTricky = computed(() => this.tricky() > 0);

  reviewNonMastered(): void {
    const stale = this.nonMasteredCards();
    if (!stale.length) return;
    const cards = this.resolveLatestCards(stale);
    this.reviewStore.startSession(cards, this.session()?.collectionId ?? null, 'Struggled cards retry');
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  goToStories(): void {
    void this.router.navigate(['/stories']);
  }

  goToHub(): void {
    this.reviewStore.clearSession();
    void this.router.navigate([ReviewRoute.HUB]);
  }

  private resolveLatestCards(fallback: Card[]): Card[] {
    const liveCards = this.cardStore.cards();
    if (!liveCards.length) return fallback;
    const liveMap = new Map(liveCards.map(c => [c.id, c]));
    return fallback.map(c => liveMap.get(c.id) ?? c);
  }
}
