import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkCircleOutline, repeatOutline } from 'ionicons/icons';
import {Card, ConfidenceRating} from '@lingua-card/shared/domain';
import {ReviewStore} from '../../store/review.store';
import {CategoryStore} from '../../../vault/store/category.store';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';

const MASTERY_LABELS = ['New', 'Beginner', 'Learning', 'Familiar', 'Good', 'Mastered'];
const RATING_LABELS = ['Blank', 'Hard', 'Hmm', 'Good', 'Easy', 'Nailed'];

@Component({
  selector: 'lc-session-summary',
  standalone: true,
  templateUrl: './session-summary.page.html',
  styleUrls: ['./session-summary.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, WordCardComponent],
})
export class SessionSummaryPage implements OnInit {
  private readonly reviewStore = inject(ReviewStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, repeatOutline });
  }

  readonly session = this.reviewStore.completedSession;

  ngOnInit(): void {
    if (!this.session()) {
      void this.navCtrl.navigateBack('/review');
    }
  }

  readonly reviewedCount = computed(() => {
    const s = this.session();
    return s ? Object.keys(s.ratings).length : 0;
  });

  readonly duration = computed(() => {
    const s = this.session();
    if (!s?.completedAt || !s.startedAt) return '—';
    const ms = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSecs / 60);
    const sec = totalSecs % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  });

  readonly averageRating = computed(() => {
    const s = this.session();
    if (!s) return '—';
    const vals = Object.values(s.ratings) as number[];
    if (!vals.length) return '—';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg.toFixed(1);
  });

  // Rating breakdown: ordered 5 → 0 (best first)
  readonly ratingBreakdown = computed(() => {
    const s = this.session();
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (s) {
      Object.values(s.ratings).forEach(r => { counts[r as number]++; });
    }
    const maxCount = Math.max(...Object.values(counts), 1);
    return [5, 4, 3, 2, 1, 0].map(v => ({
      value: v,
      label: RATING_LABELS[v],
      count: counts[v],
      percent: Math.round((counts[v] / maxCount) * 100),
    }));
  });

  // Cards sorted by rating ascending (0=hardest first), only rated cards
  readonly reviewedCardRows = computed(() => {
    const s = this.session();
    if (!s) return [];
    return s.reviewedCards
      .filter(c => s.ratings[c.id] !== undefined)
      .map(c => ({
        card: c,
        rating: s.ratings[c.id] as ConfidenceRating,
        masteryLevel: c.srsState?.masteryLevel ?? 0,
        masteryLabel: MASTERY_LABELS[c.srsState?.masteryLevel ?? 0] ?? 'New',
      }))
      .sort((a, b) => a.rating - b.rating);
  });

  readonly hardCards = computed((): Card[] =>
    this.reviewedCardRows().filter(r => r.rating < 3).map(r => r.card)
  );

  readonly hasHardCards = computed(() => this.hardCards().length > 0);

  reviewHardCards(): void {
    const cards = this.hardCards();
    if (!cards.length) return;
    this.reviewStore.startSession(cards, this.session()?.collectionId ?? null, 'Hard cards retry');
    void this.navCtrl.navigateForward('/review/player', { animated: true });
  }

  navigateToCard(card: Card): void {
    void this.router.navigate(['/vault', card.id]);
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categoryStore.categories());
  }

  goToHub(): void {
    this.reviewStore.clearSession();
    void this.router.navigate(['/review']);
  }
}
