import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkCircleOutline, repeatOutline, refreshOutline } from 'ionicons/icons';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { ReviewStore } from '../../store/review.store';
import { CategoryStore } from '../../../vault/store/category.store';
import { WordCardComponent } from '../../../../shared/ui/word-card/word-card.component';
import { getCategoryName } from '../../../../shared/helpers/helpers';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { SessionStatsService } from '../../shared/services/session-stats.service';
import {
  MASTERY_LABELS,
  MASTERY_THRESHOLD,
  RATING_LABELS,
  ReviewRoute,
} from '../../models/review.model';

@Component({
  selector: 'lc-session-summary',
  templateUrl: './session-summary.page.html',
  styleUrls: ['./session-summary.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, WordCardComponent],
})
export class SessionSummaryPage implements OnInit {
  private readonly reviewStore = inject(ReviewStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly router = inject(Router);
  private readonly wordAudio = inject(WordAudioService);
  private readonly statsService = inject(SessionStatsService);

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, repeatOutline, refreshOutline });
  }

  readonly session = this.reviewStore.completedSession;

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

  readonly averageRating = computed(() => {
    const s = this.session();
    return s ? this.statsService.avgRating(s) : '—';
  });

  readonly ratingBreakdown = computed(() => {
    const s = this.session();
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (s) {
      Object.values(s.ratings).forEach(r => { counts[r as number]++; });
    }
    const maxCount = Math.max(...Object.values(counts), 1);
    return ([5, 4, 3, 2, 1, 0] as ConfidenceRating[]).map(v => ({
      value: v,
      label: RATING_LABELS[v],
      count: counts[v],
      percent: Math.round((counts[v] / maxCount) * 100),
    }));
  });

  readonly reviewedCardRows = computed(() => {
    const s = this.session();
    if (!s) return [];
    return s.reviewedCards
      .filter(c => s.ratings[c.id] !== undefined)
      .map(c => ({
        card: c,
        rating: s.ratings[c.id] as ConfidenceRating,
        masteryLevel: c.srsState?.masteryLevel ?? 0,
        masteryLabel: MASTERY_LABELS[c.srsState?.masteryLevel ?? 0],
      }))
      .sort((a, b) => a.rating - b.rating);
  });

  readonly allReviewedCards = computed((): Card[] =>
    this.reviewedCardRows().map(r => r.card)
  );

  readonly nonMasteredCards = computed((): Card[] =>
    this.reviewedCardRows().filter(r => r.rating < MASTERY_THRESHOLD).map(r => r.card)
  );

  readonly hasNonMasteredCards = computed(() => this.nonMasteredCards().length > 0);

  reviewAllAgain(): void {
    const cards = this.allReviewedCards();
    if (!cards.length) return;
    this.reviewStore.startSession(cards, this.session()?.collectionId ?? null, this.session()?.collectionName ?? null);
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  reviewNonMastered(): void {
    const cards = this.nonMasteredCards();
    if (!cards.length) return;
    this.reviewStore.startSession(cards, this.session()?.collectionId ?? null, 'Struggled cards retry');
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  navigateToCard(card: Card): void {
    void this.router.navigate(['/vault', card.id]);
  }

  playCardAudio(card: Card): void {
    void this.wordAudio.playCard(card);
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categoryStore.categories());
  }

  goToHub(): void {
    this.reviewStore.clearSession();
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
