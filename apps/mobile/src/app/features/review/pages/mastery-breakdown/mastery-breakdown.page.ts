import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, warningOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { isMastered, lifecycleState, type CardLifecycleState } from '../../../../shared/srs/srs-status';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { ReviewStore } from '../../store/review.store';
import { ReviewFilterService } from '../../services/review-filter.service';
import { ReviewLimit, ReviewRoute, ReviewSortOrder, ReviewSource } from '../../models/review.model';

interface LifecycleBucket {
  state: CardLifecycleState;
  labelKey: string;
  subKey: string;
  colour: string;
  count: number;
  pct: number;
}

interface CollectionMastery {
  id: string;
  name: string;
  mastered: number;
  total: number;
  pct: number;
}

// Lifecycle bucket colours (warm redesign palette). Fixed hex — used as inline
// style/SVG fills where SCSS tokens cannot reach.
const LIFECYCLE: { state: CardLifecycleState; labelKey: string; subKey: string; colour: string }[] = [
  { state: 'new', labelKey: 'review.mastery.bucketNew', subKey: 'review.mastery.bucketNewSub', colour: '#B0A593' },
  { state: 'learning', labelKey: 'review.mastery.bucketLearning', subKey: 'review.mastery.bucketLearningSub', colour: '#C99A3E' },
  { state: 'review', labelKey: 'review.mastery.bucketFamiliar', subKey: 'review.mastery.bucketFamiliarSub', colour: '#5E9E7C' },
  { state: 'mastered', labelKey: 'review.mastery.bucketMastered', subKey: 'review.mastery.bucketMasteredSub', colour: '#2E6B52' },
];

@Component({
  selector: 'lc-mastery-breakdown',
  templateUrl: './mastery-breakdown.page.html',
  styleUrls: ['./mastery-breakdown.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, TranslatePipe],
})
export class MasteryBreakdownPage {
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly filterService = inject(ReviewFilterService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ chevronBackOutline, warningOutline });
  }

  readonly masteredCount = this.cardStore.masteredCount;
  readonly totalCount = this.cardStore.totalCount;
  readonly strugglingCount = this.cardStore.strugglingCount;

  readonly overallPct = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.masteredCount() / total) * 100) : 0;
  });

  // Hero ring r=42 → circumference ≈ 263.89.
  private readonly heroCirc = 2 * Math.PI * 42;
  readonly heroCircumference = this.heroCirc;
  readonly heroRingOffset = computed(() => this.heroCirc * (1 - this.overallPct() / 100));

  readonly buckets = computed<LifecycleBucket[]>(() => {
    const cards = this.cardStore.cards();
    const total = cards.length || 1;
    const counts: Record<CardLifecycleState, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
    for (const c of cards) counts[lifecycleState(c)]++;
    return LIFECYCLE.map(l => ({
      ...l,
      count: counts[l.state],
      pct: Math.round((counts[l.state] / total) * 100),
    }));
  });

  readonly masteryByCollection = computed<CollectionMastery[]>(() => {
    const cards = this.cardStore.cards();
    return this.collectionStore
      .collections()
      .map(col => {
        const inCol = cards.filter(c => c.collectionId === col.id);
        const mastered = inCol.filter(isMastered).length;
        const total = inCol.length;
        return {
          id: col.id,
          name: `${col.emoji ?? ''} ${col.name}`.trim(),
          mastered,
          total,
          pct: total ? Math.round((mastered / total) * 100) : 0,
        };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.pct - a.pct);
  });

  drillStruggling(): void {
    const queue = this.filterService.buildQueue({
      source: ReviewSource.ALL,
      masteryLevels: [1, 2],
      sortOrder: ReviewSortOrder.MOST_LAPSES,
      limit: ReviewLimit.STRUGGLING,
    });
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, 'Struggling cards');
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
