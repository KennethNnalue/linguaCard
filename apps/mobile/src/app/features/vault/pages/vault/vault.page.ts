import {ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonLabel,
  IonProgressBar,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  ModalController,
  type RefresherCustomEvent,
  type SearchbarCustomEvent,
  type SegmentCustomEvent,
} from '@ionic/angular';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import type {CefrLevel, CollectionSummaryView, PlatformCollectionSummary} from '@lingua-card/shared/domain';
import {addIcons} from 'ionicons';
import {checkmarkOutline, closeOutline, folderOpenOutline, searchOutline} from 'ionicons/icons';
import {SyncService} from '../../../../core/services/sync.service';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {SpeedDialFabComponent} from '../../../../shared/components/speed-dial-fab/speed-dial-fab.component';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {AssignCollectionSheetComponent} from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import {CollectionCoverComponent} from '../../components/collection-cover/collection-cover.component';
import {CollectionStore} from '../../store/collection.store';
import {PlatformCollectionStore} from '../../store/platform-collection.store';
import {VaultV2Store} from '../../store/vault-v2.store';
import {ImportPage} from '../import/import.page';

const LEVEL_FILTERS: ReadonlyArray<CefrLevel | 'all'> = ['all', 'A1', 'A2', 'B1', 'B2'];
type CollectionTab = 'personal' | 'platform';

@Component({
  selector: 'lc-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonLabel,
    IonProgressBar,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    SpeedDialFabComponent,
    TranslatePipe,
    CollectionCoverComponent,
  ],
})
export class VaultPage implements OnInit, OnDestroy {
  private readonly collectionStore = inject(CollectionStore);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly syncService = inject(SyncService);
  private readonly modalController = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly vaultStore = inject(VaultV2Store);
  readonly searchOpen = signal(false);
  readonly collectionQuery = signal('');
  readonly selectedTab = signal<CollectionTab>('personal');
  readonly personalLevel = signal<CefrLevel | 'all'>('all');
  readonly levelFilters = LEVEL_FILTERS;
  readonly exploreLevel = this.platformStore.selectedLevel;
  readonly exploreLoading = this.platformStore.isLoading;
  readonly platformCollections = this.platformStore.visible;
  readonly collections = computed(() => this.vaultStore.vault()?.collections ?? []);
  readonly collectionsLoading = this.vaultStore.isVaultLoading;
  readonly showPersonalTab = computed(() =>
    this.collections().length > 0 || (this.vaultStore.vault() === null && this.collectionsLoading()),
  );
  readonly activeTab = computed(() => this.showPersonalTab() ? this.selectedTab() : 'platform');
  readonly totalCount = computed(() => this.vaultStore.vault()?.allWords.itemCount ?? 0);
  readonly masteredCount = computed(() => this.vaultStore.learningItems().filter(item =>
    item.reviewState.stage === 'mastered' && item.reviewState.relearning === undefined,
  ).length);
  readonly masteryPercent = computed(() => this.vaultStore.vault()?.allWords.masteredPercentage ?? 0);
  readonly masteryProgress = computed(() => this.masteryPercent() / 100);
  readonly filteredCollections = computed(() => {
    const query = this.collectionQuery().trim().toLocaleLowerCase();
    const level = this.personalLevel();
    return this.collections().filter(collection =>
      (level === 'all' || collection.level === level)
      && (!query || collection.name.toLocaleLowerCase().includes(query)
        || collection.titleTranslation?.toLocaleLowerCase().includes(query)),
    );
  });

  constructor() {
    addIcons({checkmarkOutline, closeOutline, folderOpenOutline, searchOutline});
    effect(() => {
      if (this.platformStore.lastAdoptEvent()?.type === 'success') {
        this.selectedTab.set('personal');
      }
    });
    if (!this.platformStore.hasEverLoaded()) {
      this.platformStore.loadCollections();
    }
  }

  ngOnInit(): void {
    this.applyCollectionSearch('');
    this.vaultStore.ensureActiveVault();
  }

  ionViewWillEnter(): void {
    this.vaultStore.ensureActiveVault();
    this.collectionStore.loadCollections();
  }

  ngOnDestroy(): void {
    this.platformStore.setSearch('');
  }

  toggleSearch(): void {
    this.searchOpen.update(isOpen => !isOpen);
    if (!this.searchOpen()) {
      this.applyCollectionSearch('');
    }
  }

  onCollectionSearch(event: SearchbarCustomEvent): void {
    this.applyCollectionSearch(event.detail.value ?? '');
  }

  onLevelChange(event: SegmentCustomEvent): void {
    const level = event.detail.value;
    if (typeof level === 'string' && this.isLevelFilter(level)) {
      this.platformStore.setLevel(level);
    }
  }

  onPersonalLevelChange(event: SegmentCustomEvent): void {
    const level = event.detail.value;
    if (typeof level === 'string' && this.isLevelFilter(level)) {
      this.personalLevel.set(level);
    }
  }

  onTabChange(event: SegmentCustomEvent): void {
    const tab = event.detail.value;
    if (tab === 'personal' || tab === 'platform') {
      this.selectedTab.set(tab);
    }
  }

  openPlatformDetail(collection: PlatformCollectionSummary): void {
    void this.router.navigate(['/vault/collections/platform', collection.id]);
  }

  openCollectionDetail(collection: CollectionSummaryView): void {
    void this.router.navigate(['/vault/collections', collection.id]);
  }

  async openAddWord(): Promise<void> {
    const modal = await this.modalController.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.collectionId) {
      this.collectionStore.loadCollections();
      void this.vaultStore.loadActiveVault();
    }
  }

  async openCreateCollection(): Promise<void> {
    const modal = await this.modalController.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      componentProps: {autoConfirmOnCreate: true},
    });
    await modal.present();
    const {data} = await modal.onDidDismiss();
    if (data?.collectionId) {
      this.collectionStore.loadCollections();
      void this.vaultStore.loadActiveVault();
      await this.promptImportAfterCreate(data.collectionId);
    }
  }

  async openImportSheet(): Promise<void> {
    const modal = await this.modalController.create({
      component: ImportPage,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: false,
      componentProps: {isModal: true},
      cssClass: 'lc-import-modal',
    });
    await modal.present();
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.syncService.forceSync();
      await this.vaultStore.loadActiveVault();
      this.platformStore.loadCollections();
    } finally {
      await event.target.complete();
    }
  }

  coverSeedFor(collection: CollectionSummaryView): string {
    return collection.coverSeed || collection.name;
  }

  collectionProgressPercent(collection: CollectionSummaryView): number {
    return collection.itemCount === 0
      ? 0
      : Math.round((collection.masteredCount / collection.itemCount) * 100);
  }

  private applyCollectionSearch(value: string): void {
    this.collectionQuery.set(value);
    this.platformStore.setSearch(value);
  }

  private isLevelFilter(value: string): value is CefrLevel | 'all' {
    return LEVEL_FILTERS.some(level => level === value);
  }

  private async promptImportAfterCreate(collectionId: string): Promise<void> {
    await this.bottomSheet.open(this.translate.instant('vault.afterCreate.title'), [
      {
        label: this.translate.instant('vault.afterCreate.importOption'),
        icon: 'cloud-upload-outline',
        handler: () => this.openImportSheet(),
      },
      {
        label: this.translate.instant('vault.afterCreate.goToOption'),
        icon: 'folder-open-outline',
        handler: () => this.router.navigate(['/vault/collections', collectionId]),
      },
      {label: this.translate.instant('vault.afterCreate.laterOption'), role: 'cancel'},
    ]);
  }
}
