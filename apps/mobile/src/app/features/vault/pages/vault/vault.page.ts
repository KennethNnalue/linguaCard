import {SlicePipe} from '@angular/common';
import {Component, computed, inject, signal} from '@angular/core';
import {Router} from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {addOutline, cloudUploadOutline, funnelOutline} from 'ionicons/icons';
import {Card, Collection} from '../../../../core/models/mock-data';
import { CardStore } from '../../store/card.store';
import { CategoryStore } from '../../store/category.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {MasteryDotComponent} from '../../../../shared/components/mastery-dot/mastery-dot.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {CollectionStore} from '../../store/collection.store';

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
    IonSegment,
    IonSegmentButton,
    IonLabel,
    MasteryDotComponent,
    ArticleBadgeComponent,
    SlicePipe,
  ],
})
export class VaultPage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);

  constructor() {
    addIcons({addOutline, cloudUploadOutline, funnelOutline});
  }

  readonly activeTab = signal<'words' | 'collections'>('words');

  readonly loading = this.cardStore.isLoading;
  readonly totalCount = this.cardStore.totalCount;
  readonly categories = this.categoryStore.categories;
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

  readonly collections = this.collectionStore.collections;
  readonly totalCards = this.collectionStore.totalCards;
  readonly totalDue = this.collectionStore.totalDue;

  onTabChange(event: CustomEvent): void {
    this.activeTab.set(event.detail.value as 'words' | 'collections');
  }

  async openAddWord(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.created) {
      this.cardStore.loadCards();
      this.collectionStore.loadCollections();
    }
  }

  handleRefresh(event: any): void {
    this.cardStore.loadCards();
    this.collectionStore.loadCollections();
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

  openCollectionDetail(col: Collection): void {
    this.router.navigate(['/vault/collections', col.id]);
  }

  progressPercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round((col.masteredCount / col.cardCount) * 100);
  }

  navigateToImport(): void {
    this.router.navigate(['/vault/import']);
  }

  protected readonly getCategoryName = getCategoryName;
}
