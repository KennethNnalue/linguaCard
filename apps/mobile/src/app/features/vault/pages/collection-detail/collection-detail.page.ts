import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AlertController, IonContent, IonHeader, IonIcon, IonToolbar, ModalController,} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {chevronBackOutline, ellipsisHorizontalOutline, playOutline, volumeHighOutline,} from 'ionicons/icons';
import {Card, Collection} from '../../../../core/models/mock-data';
import { CollectionApiService } from '../../services/collection-api.service';
import { CategoryStore } from '../../store/category.store';
import {CollectionStore} from '../../store/collection.store';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {MasteryDotComponent} from '../../../../shared/components/mastery-dot/mastery-dot.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {FabButtonComponent} from "../../../../shared/components/fab-button/fab-button.component";
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewStore} from '../../../review/store/review.store';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  templateUrl: './collection-detail.page.html',
  styleUrls: ['./collection-detail.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ArticleBadgeComponent, MasteryDotComponent, FabButtonComponent],
})
export class CollectionDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);

  readonly collection = signal<Collection | null>(null);
  readonly allCards = signal<Card[]>([]);
  readonly activeCategoryId = signal<string | null>(null);
  readonly loading = signal(true);

  readonly categories = this.categoryStore.categories;

  readonly categoryIds = computed(() => {
    const cards = this.allCards();
    return [...new Set(cards.flatMap(c => c.categoryIds))];
  });

  readonly filteredCards = computed(() => {
    const catId = this.activeCategoryId();
    const cards = this.allCards();
    return catId ? cards.filter(c => c.categoryIds.includes(catId)) : cards;
  });

  readonly wordCount = computed(() => this.allCards().length);

  readonly dueCount = computed(() => {
    const now = new Date();
    return this.allCards().filter(
      c => c.srsState && new Date(c.srsState.nextDueAt) <= now,
    ).length;
  });

  readonly masteredCount = computed(() =>
    this.allCards().filter(c => (c.srsState?.masteryLevel ?? 0) >= 5).length,
  );

  readonly progressPercent = computed(() => {
    const total = this.wordCount();
    if (!total) return 0;
    return Math.round((this.masteredCount() / total) * 100);
  });

  protected readonly getCategoryName = getCategoryName;

  constructor() {
    addIcons({
      chevronBackOutline,
      playOutline,
      volumeHighOutline,
      ellipsisHorizontalOutline,
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.collectionApi.getById(id).subscribe({
      next: col => this.collection.set(col),
      error: () => this.goBack(),
    });
    this.collectionApi.getCards(id).subscribe({
      next: cards => {
        this.allCards.set(cards);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goBack(): void {
    this.router.navigate(['/vault/collections']);
  }

  startReview(): void {
    const col = this.collection();
    if (!col) return;
    const useDue = this.dueCount() > 0;
    const queue = this.filterService.buildQueue({
      source: col.id,
      masteryLevels: [0, 1, 2, 3, 4, 5],
      sortOrder: useDue ? 'due_date' : 'hardest',
      limit: 50,
    });
    if (!queue.length) return;
    const collectionName = `${col.emoji ?? ''} ${col.name}`.trim();
    this.reviewStore.startSession(queue, col.id, collectionName);
    this.router.navigate(['/review/player']);
  }

  startListen(): void {
    const col = this.collection();
    if (!col) return;
    this.router.navigate(['/listen'], {queryParams: {collectionId: col.id}});
  }

  async openAddWord(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handleBehavior: 'cycle',
      componentProps: {lockedCollectionId: col.id},
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.created) {
      const id = this.route.snapshot.paramMap.get('id')!;
      this.collectionApi.getCards(id).subscribe(cards => this.allCards.set(cards));
      this.collectionStore.loadCollections();
    }
  }

  async showMenu(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const alert = await this.alertCtrl.create({
      header: col.name,
      buttons: [
        ...(this.wordCount() > 0 ? [{
          text: 'Clear all words',
          role: 'destructive',
          handler: () => this.confirmClearWords(),
        }] : []),
        {
          text: 'Delete collection',
          role: 'destructive',
          handler: () => this.confirmDelete(),
        },
        {text: 'Cancel', role: 'cancel'},
      ],
    });
    await alert.present();
  }

  private async confirmClearWords(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const alert = await this.alertCtrl.create({
      header: 'Clear all words?',
      message: `This will permanently delete all ${this.wordCount()} word${this.wordCount() === 1 ? '' : 's'} in "${col.name}". This cannot be undone.`,
      buttons: [
        {
          text: 'Clear all',
          role: 'destructive',
          handler: () => this.clearAllWords(),
        },
        {text: 'Cancel', role: 'cancel'},
      ],
    });
    await alert.present();
  }

  private clearAllWords(): void {
    const col = this.collection();
    if (!col) return;
    this.collectionApi.clearCards(col.id).subscribe(() => {
      this.allCards.set([]);
      this.collectionStore.loadCollections();
    });
  }

  private async confirmDelete(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const alert = await this.alertCtrl.create({
      header: 'Delete collection?',
      message: `Words will not be deleted — they'll appear under "All words" in the Vault.`,
      buttons: [
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.collectionStore.deleteCollection(col.id).subscribe();
            this.router.navigate(['/vault/collections']);
          },
        },
        {text: 'Cancel', role: 'cancel'},
      ],
    });
    await alert.present();
  }

  setCategory(id: string | null): void {
    this.activeCategoryId.set(id);
  }

  openDetail(card: Card): void {
    this.router.navigate(['/vault', card.id]);
  }
}
