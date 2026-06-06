import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {addOutline, calendarOutline, cameraOutline, chevronDownOutline, cloudUploadOutline, documentTextOutline, ellipsisVerticalOutline, folderOpenOutline, funnelOutline, starOutline, textOutline, timeOutline} from 'ionicons/icons';
import {Card, Collection} from '@lingua-card/shared/domain';
import {CardStore} from '../../store/card.store';
import {SyncService} from '../../../../core/services/sync.service';
import {CategoryStore} from '../../store/category.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {AssignCollectionSheetComponent} from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import {CollectionStore} from '../../store/collection.store';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {SpeedDialFabComponent} from '../../../../shared/components/speed-dial-fab/speed-dial-fab.component';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {ImportPage} from '../import/import.page';

type VaultMasteryFilter = 'all' | 'due' | 'new' | 'learning' | 'mastered';
type VaultSortMode = 'newest' | 'alphabetical' | 'mastery' | 'due-date';

@Component({
  selector: 'lc-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    WordCardComponent,
    SpeedDialFabComponent,
  ],
})
export class VaultPage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly syncService = inject(SyncService);
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly router = inject(Router);

  readonly activeTab = signal<'words' | 'collections'>('words');
  readonly masteryFilter = signal<VaultMasteryFilter>('all');

  readonly sortMode = signal<VaultSortMode>('newest');

  constructor() {
    addIcons({addOutline, cloudUploadOutline, funnelOutline, chevronDownOutline, cameraOutline, ellipsisVerticalOutline, documentTextOutline, timeOutline, textOutline, starOutline, calendarOutline, folderOpenOutline});
    const tab = inject(ActivatedRoute).snapshot.queryParams['tab'];
    if (tab === 'collections') this.activeTab.set('collections');
  }

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

  private readonly cardCounts = computed(() => {
    const now = new Date();
    let due = 0, fresh = 0, mastered = 0;
    for (const c of this.cardStore.cards()) {
      if (!c.srsState?.nextDueAt || new Date(c.srsState.nextDueAt) <= now) due++;
      if (!c.srsState || c.srsState.state === 'new') fresh++;
      if (c.srsState?.state === 'mastered') mastered++;
    }
    return {due, fresh, mastered};
  });

  readonly dueCount = computed(() => this.cardCounts().due);
  readonly newCount = computed(() => this.cardCounts().fresh);
  readonly masteredCount = computed(() => this.cardCounts().mastered);

  readonly collections = this.collectionStore.collections;
  readonly collectionsLoading = this.collectionStore.isLoading;
  readonly totalCards = this.collectionStore.totalCards;
  readonly totalDue = this.collectionStore.totalDue;

  setMasteryFilter(f: VaultMasteryFilter): void {
    this.masteryFilter.set(f);
  }

  async openSortSheet(): Promise<void> {
    await this.bottomSheet.open('Sort by', [
      {label: 'Newest first', icon: 'time-outline', handler: () => this.sortMode.set('newest')},
      {label: 'A–Z (alphabetical)', icon: 'text-outline', handler: () => this.sortMode.set('alphabetical')},
      {label: 'Mastery (lowest first)', icon: 'star-outline', handler: () => this.sortMode.set('mastery')},
      {label: 'Due date', icon: 'calendar-outline', handler: () => this.sortMode.set('due-date')},
      {label: 'Cancel', role: 'cancel'},
    ]);
  }

  async openAddWord(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.collectionId) {
      // Collection assignment changed — refresh collection counts from server
      this.collectionStore.loadCollections();
    }
  }

  async openCreateCollection(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
      componentProps: {autoConfirmOnCreate: true},
    });
    await modal.present();
    const {data} = await modal.onDidDismiss();
    if (data?.collectionId) {
      await this._promptImportAfterCreate(data.collectionId);
    }
  }

  private async _promptImportAfterCreate(collectionId: string): Promise<void> {
    await this.bottomSheet.open('Add words to your collection?', [
      {label: 'Import words', icon: 'cloud-upload-outline', handler: () => this.openImportSheet()},
      {label: 'Go to collection', icon: 'folder-open-outline', handler: () => this.router.navigate(['/vault/collections', collectionId])},
      {label: 'Maybe later', role: 'cancel'},
    ]);
  }

  async openImportSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ImportPage,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: false,
      componentProps: {isModal: true},
      cssClass: 'lc-import-modal',
    });
    await modal.present();
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
    void this.wordAudio.playCard(card);
  }

  openCollectionDetail(col: Collection): void {
    this.router.navigate(['/vault/collections', col.id]);
  }

  progressPercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round((col.masteredCount / col.cardCount) * 100);
  }

  duePercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round(((col.dueCount ?? 0) / col.cardCount) * 100);
  }

  urgencyLevel(col: Collection): 'high' | 'medium' | 'none' {
    if (!col.cardCount) return 'none';
    const ratio = (col.dueCount ?? 0) / col.cardCount;
    if (ratio >= 0.5) return 'high';
    if (ratio >= 0.2) return 'medium';
    return 'none';
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categories());
  }
}
