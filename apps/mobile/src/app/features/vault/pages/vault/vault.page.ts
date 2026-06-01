import {SlicePipe} from '@angular/common';
import {Component, computed, inject, signal} from '@angular/core';
import {Router} from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {addOutline, chevronDownOutline, cloudUploadOutline, funnelOutline} from 'ionicons/icons';
import {Card, Collection} from '@lingua-card/shared/domain';
import {CardStore} from '../../store/card.store';
import {SyncService} from '../../../../core/services/sync.service';
import {CategoryStore} from '../../store/category.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {CollectionStore} from '../../store/collection.store';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {PronunciationService} from '../../../ai/audio/pronunciation.service';

type VaultMasteryFilter = 'all' | 'due' | 'new' | 'learning' | 'mastered';
type VaultSortMode = 'newest' | 'alphabetical' | 'mastery' | 'due-date';

@Component({
  selector: 'lc-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    SlicePipe,
    WordCardComponent,
  ],
})
export class VaultPage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  readonly collectionStore = inject(CollectionStore);
  private readonly syncService = inject(SyncService);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly pronunciationService = inject(PronunciationService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({addOutline, cloudUploadOutline, funnelOutline, chevronDownOutline});
  }

  readonly activeTab = signal<'words' | 'collections'>('words');
  readonly masteryFilter = signal<VaultMasteryFilter>('all');
  readonly sortMode = signal<VaultSortMode>('newest');

  readonly loading = computed(() => this.cardStore.isLoading() && this.cardStore.cards().length === 0);
  readonly totalCount = this.cardStore.totalCount;
  readonly categories = this.categoryStore.categories;

  readonly sortLabel = computed(() => {
    const labels: Record<VaultSortMode, string> = {
      newest: 'Newest',
      alphabetical: 'A–Z',
      mastery: 'Mastery',
      'due-date': 'Due date',
    };
    return labels[this.sortMode()];
  });

  private readonly sortedCards = computed(() => {
    const cards = [...this.cardStore.filteredCards()];
    switch (this.sortMode()) {
      case 'alphabetical':
        return cards.sort((a, b) => a.content.back.localeCompare(b.content.back, 'de'));
      case 'mastery':
        return cards.sort((a, b) => (a.srsState?.masteryLevel ?? 0) - (b.srsState?.masteryLevel ?? 0));
      case 'due-date':
        return cards.sort((a, b) => {
          const aDate = a.srsState?.nextDueAt ? new Date(a.srsState.nextDueAt).getTime() : 0;
          const bDate = b.srsState?.nextDueAt ? new Date(b.srsState.nextDueAt).getTime() : 0;
          return aDate - bDate;
        });
      default:
        return cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  });

  readonly cards = computed(() => {
    const cards = this.sortedCards();
    switch (this.masteryFilter()) {
      case 'due':
        return cards.filter(c => !c.srsState?.nextDueAt || new Date(c.srsState.nextDueAt) <= new Date());
      case 'new':
        return cards.filter(c => !c.srsState || c.srsState.state === 'new');
      case 'learning':
        return cards.filter(c => c.srsState?.state === 'learning');
      case 'mastered':
        return cards.filter(c => c.srsState?.state === 'mastered');
      default:
        return cards;
    }
  });

  readonly dueCount = computed(() =>
    this.cardStore.cards().filter(c => !c.srsState?.nextDueAt || new Date(c.srsState.nextDueAt) <= new Date()).length
  );

  readonly collections = this.collectionStore.collections;
  readonly totalCards = this.collectionStore.totalCards;
  readonly totalDue = this.collectionStore.totalDue;

  onTabChange(event: CustomEvent): void {
    this.activeTab.set(event.detail.value as 'words' | 'collections');
  }

  setMasteryFilter(f: VaultMasteryFilter): void {
    this.masteryFilter.set(f);
  }

  async openSortSheet(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Sort by',
      buttons: [
        {text: 'Newest first', handler: () => this.sortMode.set('newest')},
        {text: 'A–Z (alphabetical)', handler: () => this.sortMode.set('alphabetical')},
        {text: 'Mastery (lowest first)', handler: () => this.sortMode.set('mastery')},
        {text: 'Due date', handler: () => this.sortMode.set('due-date')},
        {text: 'Cancel', role: 'cancel'},
      ],
    });
    await sheet.present();
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

  async handleRefresh(event: Event): Promise<void> {
    await this.syncService.forceSync();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onSearch(event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    this.cardStore.setSearch(value);
  }

  openDetail(card: Card): void {
    this.router.navigate(['/vault', card.id]);
  }

  playAudio(card: Card): void {
    void this.pronunciationService.play(card);
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

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categories());
  }
}
