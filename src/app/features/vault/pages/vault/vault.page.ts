import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, funnelOutline } from 'ionicons/icons';
import { MockCategoryService } from '../../../../core/services/mock-services';
import { Card } from '../../../../core/models/mock-data';
import { CardStore } from '../../../../core/store/card.store';
import { getCategoryName } from '../../../../shared/helpers/helpers';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { MasteryDotComponent } from '../../../../shared/components/mastery-dot/mastery-dot.component';
import { AddWordSheetComponent } from '../../components/add-word-sheet/add-word-sheet.component';

@Component({
  selector: 'app-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    MasteryDotComponent,
    ArticleBadgeComponent,
  ],
})
export class VaultPage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryService = inject(MockCategoryService);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ addOutline, funnelOutline });
  }

  readonly loading = this.cardStore.isLoading;
  readonly totalCount = this.cardStore.totalCount;
  readonly categories = this.categoryService.categories;
  readonly activeCategory = computed(() => this.cardStore.filter().categoryId);

  readonly sortOrder = signal<'asc' | 'desc'>('desc');
  readonly sortLabel = computed(() =>
    this.sortOrder() === 'desc' ? 'Newest first' : 'Oldest first',
  );

  readonly cards = computed(() => {
    const order = this.sortOrder();
    return [...this.cardStore.filteredCards()].sort((a, b) => {
      const dA = new Date(a.createdAt).getTime();
      const dB = new Date(b.createdAt).getTime();
      return order === 'desc' ? dB - dA : dA - dB;
    });
  });

  async openAddWord(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.created) this.cardStore.loadCards();
  }

  handleRefresh(event: any): void {
    this.cardStore.loadCards();
    setTimeout(() => event.target.complete(), 800);
  }

  onSearch(event: any): void {
    this.cardStore.setSearch(event.detail.value ?? '');
  }

  setCategory(categoryId: string | null): void {
    this.cardStore.setCategoryFilter(categoryId);
  }

  toggleSort(): void {
    this.sortOrder.update(o => (o === 'asc' ? 'desc' : 'asc'));
  }

  openDetail(card: Card): void {
    this.router.navigate(['/vault', card.id]);
  }

  protected readonly getCategoryName = getCategoryName;
}
