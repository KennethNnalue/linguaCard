import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavController, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import {Card} from '@lingua-card/shared/domain';
import {ReviewStore} from '../../store/review.store';
import {ReviewFilterService} from '../../services/review-filter.service';
import {CategoryStore} from '../../../vault/store/category.store';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';

@Component({
  selector: 'lc-struggling-cards',
  templateUrl: './struggling-cards.page.html',
  styleUrls: ['./struggling-cards.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, WordCardComponent],
})
export class StrugglingCardsPage {
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ chevronBackOutline });
  }

  readonly strugglingCards = computed(() => this.filterService.getStrugglingCards(50));

  articleBg(card: Card): string {
    switch (card.content.article) {
      case 'der': return 'var(--lc-masc-bg)';
      case 'die': return 'var(--lc-fem-bg)';
      case 'das': return 'var(--lc-neut-bg)';
      default: return 'var(--lc-card)';
    }
  }

  articleBorder(card: Card): string {
    switch (card.content.article) {
      case 'der': return 'var(--lc-masc-border)';
      case 'die': return 'var(--lc-fem-border)';
      case 'das': return 'var(--lc-neut-border)';
      default: return 'var(--lc-border)';
    }
  }

  failCount(card: Card): number {
    const s = card.srsState;
    if (!s) return 0;
    return Math.max(0, s.repetitions - (s.masteryLevel * 2));
  }

  failBadgeClass(card: Card): string {
    return this.failCount(card) >= 4 ? 'fail-badge--red' : 'fail-badge--amber';
  }

  lastReviewedLabel(card: Card): string {
    const t = card.srsState?.lastReviewedAt;
    if (!t) return 'Never';
    const diffMs = Date.now() - new Date(t).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  }

  startReview(): void {
    const queue = this.strugglingCards();
    if (!queue.length) return;
    this.reviewStore.startSession(queue, null, 'Struggling cards');
    void this.navCtrl.navigateForward('/review/player');
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categoryStore.categories());
  }

  openWordDetail(card: Card): void {
    void this.router.navigate(['/vault', card.id]);
  }

  goBack(): void {
    void this.router.navigate(['/review']);
  }
}
