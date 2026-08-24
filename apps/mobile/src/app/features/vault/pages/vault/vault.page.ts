import {ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {IonContent, IonRefresher, IonRefresherContent, ModalController} from '@ionic/angular/standalone';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import type {Card, CardView, CefrLevel, CollectionSummaryView, PlatformCollectionSummary} from '@lingua-card/shared/domain';
import {CardStore} from '../../store/card.store';
import {CollectionStore} from '../../store/collection.store';
import {PlatformCollectionStore} from '../../store/platform-collection.store';
import {SyncService} from '../../../../core/services/sync.service';
import {EngagementStore} from '../../../engagement/state/engagement.store';
import {stageIndicator} from '../../../review/domain/review-status';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {AssignCollectionSheetComponent} from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import {SpeedDialFabComponent} from '../../../../shared/components/speed-dial-fab/speed-dial-fab.component';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {ImportPage} from '../import/import.page';
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewPlayerService} from '../../../review/services/review-player.service';
import {SettingsStore} from '../../../settings/store/settings.store';
import {VaultV2Store} from '../../store/vault-v2.store';
import {CollectionCoverComponent} from '../../components/collection-cover/collection-cover.component';

type VaultView = 'home' | 'index' | 'explore' | 'collections';
type MasteryFilter = 'all' | 'due' | 'new' | 'mastered';

interface MasterySegment {
  level: number;
  width: number;
  color: string;
}

interface CollectionCounts {
  cardCount: number;
  dueCount: number;
  masteredCount: number;
}

const EMPTY_COUNTS: CollectionCounts = {cardCount: 0, dueCount: 0, masteredCount: 0};

@Component({
  selector: 'lc-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonRefresher,
    IonRefresherContent,
    SpeedDialFabComponent,
    TranslatePipe,
    CollectionCoverComponent,
  ],
})
export class VaultPage implements OnInit, OnDestroy {
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly engagementStore = inject(EngagementStore);
  private readonly syncService = inject(SyncService);
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly filterService = inject(ReviewFilterService);
  private readonly settingsStore = inject(SettingsStore);
  readonly vaultStore = inject(VaultV2Store);

  constructor() {
    // Curated Explore content is lazy in the store — load it the first time the
    // Vault home is shown so the Explore rail can render without a tab visit.
    if (!this.platformStore.hasEverLoaded()) {
      this.platformStore.loadCollections();
    }
  }

  ngOnInit(): void {
    // The Vault may be the first page shown (deep link / tab restore); the streak
    // store has no auto-load, so refresh it here rather than depending on Home.
    void this.engagementStore.loadEngagement();
    this.vaultStore.loadActiveVault();
    // Start each visit with a clean search so a stale query can't filter the
    // shared CardStore / PlatformCollectionStore from a previous session.
    this.applyCollectionSearch('');
    this.cardStore.setSearch('');
    // Returning from a platform-collection detail re-opens the in-page Explore.
    if (this.route.snapshot.queryParams['view'] === 'explore') {
      this.view.set('explore');
    }
  }

  ngOnDestroy(): void {
    // Don't leak this page's search into other consumers of the shared stores.
    this.platformStore.setSearch('');
    this.cardStore.setSearch('');
  }

  /** Single-scroll library: home, the in-page word index, and the in-page Explore. */
  readonly view = signal<VaultView>('home');
  readonly masteryFilter = signal<MasteryFilter>('all');

  /** Inline collection search on the home — filters personal AND platform sets. */
  readonly searchOpen = signal(false);
  readonly collectionQuery = signal('');

  /** Explore (curated platform collections) — mirrors the Story home rail/grid. */
  readonly exploreLevel = this.platformStore.selectedLevel;
  readonly exploreLoading = this.platformStore.isLoading;

  readonly levelFilters: ReadonlyArray<{ value: CefrLevel | 'all'; label: string }> = [
    {value: 'all', label: 'All'},
    {value: 'A1', label: 'A1'},
    {value: 'A2', label: 'A2'},
    {value: 'B1', label: 'B1'},
    {value: 'B2', label: 'B2'},
  ];

  /** Personal collections, filtered by the inline search query. */
  readonly filteredCollections = computed(() => {
    const q = this.collectionQuery().trim().toLowerCase();
    const cols = this.collections();
    if (!q) return cols;
    return cols.filter(c => c.name.toLowerCase().includes(q));
  });

  /** Rail preview on the home (capped) vs. the full in-page Explore grid. */
  readonly exploreCards = computed(() => this.platformStore.visible().slice(0, 12));
  readonly exploreAll = this.platformStore.visible;

  // ─── Library data ──────────────────────────────────────────────────────────
  readonly loading = this.vaultStore.isLearningItemsLoading;
  readonly totalCount = computed(() => this.vaultStore.vault()?.allWords.itemCount ?? 0);
  readonly collections = computed(() => this.vaultStore.vault()?.collections ?? []);
  readonly collectionsLoading = this.vaultStore.isVaultLoading;
  readonly collectionCount = computed(() => this.collections().length);
  readonly dayStreak = this.engagementStore.dayStreak;

  /** Lifecycle counts — canonical selectors (new is never counted as due). */
  private readonly counts = computed(() => {
    const now = new Date();
    let due = 0, fresh = 0, mastered = 0;
    for (const c of this.vaultStore.learningItems()) {
      if (this.isViewDue(c, now)) due++;
      if (c.reviewState.stage === 'new') fresh++;
      if (c.reviewState.stage === 'mastered') mastered++;
    }
    return {due, fresh, mastered};
  });

  readonly dueCount = computed(() => this.counts().due);
  readonly newCount = computed(() => this.counts().fresh);
  readonly masteredCount = computed(() => this.counts().mastered);

  /** Stacked mastery distribution (6 segments, levels 0–5). */
  readonly distSegments = computed<MasterySegment[]>(() => {
    const cards = this.vaultStore.learningItems();
    const total = cards.length || 1;
    const buckets = [0, 0, 0, 0, 0, 0];
    for (const c of cards) buckets[stageIndicator(c.reviewState.stage)]++;
    return buckets.map((n, level) => ({
      level,
      width: (n / total) * 100,
      color: `var(--lc-mastery-${level})`,
    }));
  });

  /** Weighted mastery progress across all six levels (0–100). */
  readonly masteryPct = computed(() => {
    const cards = this.vaultStore.learningItems();
    if (cards.length === 0) return 0;
    const weighted = cards.reduce((sum, c) => sum + stageIndicator(c.reviewState.stage), 0);
    return Math.round((weighted / (cards.length * 5)) * 100);
  });

  // ─── Word index ──────────────────────────────────────────────────────────────
  readonly wordQuery = signal('');
  readonly indexCards = computed(() => {
    const query = this.wordQuery().trim().toLocaleLowerCase();
    const cards = this.vaultStore.learningItems().filter(item => !query
      || item.lexeme.text.toLocaleLowerCase().includes(query)
      || item.localization.translation.toLocaleLowerCase().includes(query));
    const now = new Date();
    switch (this.masteryFilter()) {
      case 'due': return cards.filter(c => this.isViewDue(c, now));
      case 'new': return cards.filter(c => c.reviewState.stage === 'new');
      case 'mastered': return cards.filter(c => c.reviewState.stage === 'mastered');
      default: return cards;
    }
  });

  // ─── Navigation between library and index ────────────────────────────────────
  openIndex(): void {
    this.wordQuery.set('');
    this.view.set('index');
  }

  goHome(): void {
    this.wordQuery.set('');
    this.view.set('home');
  }

  // ─── Inline collection search (home) ─────────────────────────────────────────
  toggleSearch(): void {
    const next = !this.searchOpen();
    this.searchOpen.set(next);
    if (!next) this.applyCollectionSearch('');
  }

  onCollectionSearch(event: Event): void {
    this.applyCollectionSearch((event.target as HTMLInputElement).value ?? '');
  }

  clearSearch(): void {
    this.applyCollectionSearch('');
  }

  private applyCollectionSearch(value: string): void {
    this.collectionQuery.set(value);
    this.platformStore.setSearch(value); // filters the Explore rail/grid too
  }

  // ─── Explore (platform collections) ──────────────────────────────────────────
  setExploreLevel(level: CefrLevel | 'all'): void {
    this.platformStore.setLevel(level);
  }

  /** "See all" — expand the Explore rail into the full in-page grid (no navigation). */
  openExploreAll(): void {
    this.view.set('explore');
  }

  backFromExplore(): void {
    this.view.set('home');
  }

  openCollectionsAll(): void {
    this.view.set('collections');
  }

  backFromCollections(): void {
    this.view.set('home');
  }

  openPlatformDetail(c: PlatformCollectionSummary): void {
    void this.router.navigate(['/vault/collections/platform', c.id]);
  }

  setMasteryFilter(f: MasteryFilter): void {
    this.masteryFilter.set(f);
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    this.wordQuery.set(value);
  }

  // ─── Entry points ─────────────────────────────────────────────────────────────
  startReview(): void {
    const dailyGoal = this.settingsStore.dailyGoal();
    void this.reviewPlayer.openSource({ kind: 'daily' }, dailyGoal);
  }

  startListen(): void {
    void this.router.navigateByUrl('/listen');
  }

  openDetail(card: CardView): void {
    void this.router.navigate(['/vault', card.id]);
  }

  openCollectionDetail(col: CollectionSummaryView): void {
    void this.router.navigate(['/vault/collections', col.id]);
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
      this.collectionStore.loadCollections();
      await this.promptImportAfterCreate(data.collectionId);
    }
  }

  /** After creating a collection, offer to fill it (import) or jump straight in. */
  private async promptImportAfterCreate(collectionId: string): Promise<void> {
    await this.bottomSheet.open(this.translate.instant('vault.afterCreate.title'), [
      {label: this.translate.instant('vault.afterCreate.importOption'), icon: 'cloud-upload-outline', handler: () => this.openImportSheet()},
      {label: this.translate.instant('vault.afterCreate.goToOption'), icon: 'folder-open-outline', handler: () => this.router.navigate(['/vault/collections', collectionId])},
      {label: this.translate.instant('vault.afterCreate.laterOption'), role: 'cancel'},
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
    this.vaultStore.loadActiveVault();
    this.platformStore.loadCollections();
    (event.target as HTMLIonRefresherElement).complete();
  }

  // ─── Collection card helpers ──────────────────────────────────────────────────

  /**
   * Per-collection counts derived from CardStore using the same canonical
   * selectors as the hero and the collection-detail page — so the shelf badges,
   * the hero total, and the detail stats can never disagree. (CollectionStore's
   * server counts are not used for display to avoid a second source of truth.)
   */
  statsFor(id: string): CollectionCounts {
    const collection = this.collections().find(item => item.id === id);
    return collection ? {
      cardCount: collection.itemCount,
      dueCount: collection.dueCount,
      masteredCount: collection.masteredCount,
    } : EMPTY_COUNTS;
  }

  coverSeedFor(collection: CollectionSummaryView): string {
    return collection.coverSeed || collection.name;
  }

  coverClassFor(id: string): string {
    // Deterministic gradient per collection id — stable regardless of list order
    // or filtering, so a shelf and its detail hero always share the same cover.
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return `cover-${(Math.abs(hash) % 6) + 1}`;
  }

  progressPercent(s: CollectionCounts): number {
    if (!s.cardCount) return 0;
    return Math.round((s.masteredCount / s.cardCount) * 100);
  }

  urgencyLevel(s: CollectionCounts): 'high' | 'medium' | 'none' {
    if (!s.cardCount) return 'none';
    const ratio = s.dueCount / s.cardCount;
    if (ratio >= 0.5) return 'high';
    if (ratio >= 0.2) return 'medium';
    return 'none';
  }

  private isViewDue(item: CardView, now: Date): boolean {
    if (!item.reviewState.dueAt) return false;
    return item.reviewState.stage !== 'new'
      && item.reviewState.stage !== 'mastered'
      && item.reviewState.masterySource !== 'manual'
      && new Date(item.reviewState.dueAt).getTime() <= now.getTime();
  }
}
