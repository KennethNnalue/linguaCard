import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, refreshOutline, sparklesOutline } from 'ionicons/icons';
import { ReviewRating } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../store/review.store';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import { ReviewStatsStore } from '../../store/review-stats.store';
import { ReviewRoute } from '../../models/review.model';

interface RatingBar {
  value: ReviewRating;
  labelKey: string;
  cls: string;
  count: number;
  percent: number;
}

const RATING_BAR_KEY: Record<ReviewRating, string> = {
  again: 'review.rating.again', hard: 'review.rating.hard', good: 'review.rating.good', easy: 'review.rating.easy',
};
const RATING_BAR_CLS: Record<ReviewRating, string> = {
  again: 'again', hard: 'hard', good: 'good', easy: 'easy',
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
    const counts: Record<ReviewRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    if (s) {
      for (const rating of Object.values(s.ratings)) counts[rating]++;
    }
    const maxCount = Math.max(...Object.values(counts), 1);
    return (['easy', 'good', 'hard', 'again'] as ReviewRating[]).map(v => ({
      value: v,
      labelKey: RATING_BAR_KEY[v],
      cls: RATING_BAR_CLS[v],
      count: counts[v],
      percent: Math.round((counts[v] / maxCount) * 100),
    }));
  });

  private readonly nonMasteredCardIds = computed((): string[] => {
    const s = this.session();
    if (!s) return [];
    return s.reviewedCardIds.filter(cardId => ['again', 'hard'].includes(s.ratings[cardId] ?? 'easy'));
  });

  readonly tricky = computed(() => this.nonMasteredCardIds().length);
  readonly hasTricky = computed(() => this.tricky() > 0);

  reviewNonMastered(): void {
    const cardIds = this.nonMasteredCardIds();
    if (!cardIds.length) return;
    void this.reviewStore.startSession(
      { kind: 'explicit', cardIds },
      cardIds.length,
    ).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
  }

  goToStories(): void {
    void this.router.navigate(['/stories']);
  }

  goToHub(): void {
    this.reviewStore.clearSession();
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
