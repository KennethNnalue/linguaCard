import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, warningOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { LearningStage } from '@lingua-card/shared/domain';
import { CardStore } from '../../../vault/store/card.store';
import { ReviewPlayerService } from '../../services/review-player.service';
import { ReviewRoute } from '../../models/review.model';
import { VaultV2Store } from '../../../vault/store/vault-v2.store';

interface LifecycleBucket {
  state: LearningStage;
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
const LIFECYCLE: { state: LearningStage; labelKey: string; subKey: string; colour: string }[] = [
  { state: 'new', labelKey: 'review.mastery.bucketNew', subKey: 'review.mastery.bucketNewSub', colour: '#B0A593' },
  { state: 'learning', labelKey: 'review.mastery.bucketLearning', subKey: 'review.mastery.bucketLearningSub', colour: '#C99A3E' },
  { state: 'familiar', labelKey: 'review.mastery.bucketFamiliar', subKey: 'review.mastery.bucketFamiliarSub', colour: '#D8B981' },
  { state: 'strong', labelKey: 'review.mastery.bucketFamiliar', subKey: 'review.mastery.bucketFamiliarSub', colour: '#5E9E7C' },
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
  private readonly vaultStore = inject(VaultV2Store);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ chevronBackOutline, warningOutline });
  }

  readonly masteredCount = computed(() => this.vaultStore.learningItems()
    .filter(item => item.reviewState.stage === 'mastered' && item.reviewState.relearning === undefined).length);
  readonly totalCount = computed(() => this.vaultStore.learningItems().length);
  readonly strugglingCount = computed(() => this.vaultStore.learningItems()
    .filter(item => item.reviewState.problemStatus === 'leech'
      || (item.reviewState.totalReviewCount > 0 && item.reviewState.stage === 'learning')).length);

  ionViewWillEnter(): void {
    void this.cardStore.loadCards();
    this.vaultStore.ensureActiveVault();
  }

  readonly overallPct = computed(() => {
    const total = this.totalCount();
    return total ? Math.round((this.masteredCount() / total) * 100) : 0;
  });

  // Hero ring r=42 → circumference ≈ 263.89.
  private readonly heroCirc = 2 * Math.PI * 42;
  readonly heroCircumference = this.heroCirc;
  readonly heroRingOffset = computed(() => this.heroCirc * (1 - this.overallPct() / 100));

  readonly buckets = computed<LifecycleBucket[]>(() => {
    const cards = this.vaultStore.learningItems();
    const total = cards.length || 1;
    const counts: Record<LearningStage, number> = { new: 0, learning: 0, familiar: 0, strong: 0, mastered: 0 };
    for (const card of cards) counts[card.reviewState.stage]++;
    return LIFECYCLE.map(l => ({
      ...l,
      count: counts[l.state],
      pct: Math.round((counts[l.state] / total) * 100),
    }));
  });

  readonly masteryByCollection = computed<CollectionMastery[]>(() => {
    return this.vaultStore.vault()?.collections
      .map(collection => ({
        id: collection.id,
        name: collection.name,
        mastered: collection.masteredCount,
        total: collection.itemCount,
        pct: collection.itemCount ? Math.round((collection.masteredCount / collection.itemCount) * 100) : 0,
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.pct - a.pct) ?? [];
  });

  drillStruggling(): void {
    void this.reviewPlayer.openSource({ kind: 'struggling' }, Math.max(1, this.strugglingCount()));
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
