import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, cloudUploadOutline, searchOutline } from 'ionicons/icons';
import type { Collection, CefrLevel, PlatformCollectionSummary } from '@lingua-card/shared/domain';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { PlatformCollectionStore, TopicShelf, ringStyle } from '../../store/platform-collection.store';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';

type ActiveSegment = 'mine' | 'explore';

@Component({
  selector: 'lc-collections',
  templateUrl: './collections.page.html',
  styleUrls: ['./collections.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, SlicePipe, EmptyStateComponent, TranslatePipe],
})
export class CollectionsPage {
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly cardStore = inject(CardStore);
  readonly store = inject(CollectionStore);
  readonly platformStore = inject(PlatformCollectionStore);

  readonly activeSegment = signal<ActiveSegment>('mine');

  constructor() {
    addIcons({ addOutline, chevronBackOutline, cloudUploadOutline, searchOutline });
    const segment = inject(ActivatedRoute).snapshot.queryParams['segment'];
    if (segment === 'explore') {
      this.activeSegment.set('explore');
      this.platformStore.loadCollections();
    }

    effect(() => {
      const ev = this.platformStore.lastAdoptEvent();
      if (!ev) return;
      if (ev.type === 'success') {
        const count = ev.result.addedCount;
        void this._toast(
          count > 0 ? this.translate.instant('collections.adopt.successMessage', { count }) : this.translate.instant('collections.adopt.alreadyInSetsMessage'),
          'success',
        );
      } else {
        void this._toast(this.translate.instant('collections.adopt.errorMessage'), 'danger');
      }
    });
  }

  // ─── My Sets computed ─────────────────────────────────────────────────────────

  readonly totalCards = this.store.totalCards;
  readonly totalDue = computed(() => this.cardStore.dueCards().length);

  readonly collections = computed(() => {
    const now = new Date();
    const cards = this.cardStore.cards();
    return this.store.collections().map(col => ({
      ...col,
      dueCount: cards.filter(
        c => c.collectionId === col.id && c.srsState && new Date(c.srsState.nextDueAt) <= now,
      ).length,
    }));
  });

  // ─── Explore computed ─────────────────────────────────────────────────────────

  /** Map from adoptedCollectionId → mastery percent (0–100) for live bar fill. */
  readonly adoptedMasteryMap = computed((): Map<string, number> => {
    const map = new Map<string, number>();
    for (const col of this.store.collections()) {
      if (!col.cardCount) continue;
      map.set(col.id, Math.round((col.masteredCount / col.cardCount) * 100));
    }
    return map;
  });

  masteryPercent(adoptedCollectionId: string | null): number {
    if (!adoptedCollectionId) return 0;
    return this.adoptedMasteryMap().get(adoptedCollectionId) ?? 0;
  }

  readonly shelves = this.platformStore.shelves;
  readonly levelCounts = this.platformStore.levelCounts;
  readonly suggestedLevel = this.platformStore.suggestedLevel;
  readonly selectedLevel = this.platformStore.selectedLevel;
  readonly exploreSearch = this.platformStore.search;
  readonly exploreLoading = this.platformStore.isLoading;
  readonly adoptingId = this.platformStore.adoptingId;

  readonly levelOptions = computed((): Array<{ value: CefrLevel | 'all'; label: string; count: number; forYou: boolean }> => {
    const counts = this.levelCounts();
    const suggested = this.suggestedLevel();
    const all = Object.values(counts).reduce((a, b) => a + b, 0);
    const levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const suggestedHasCollections = (counts[suggested] ?? 0) > 0;
    const opts: Array<{ value: CefrLevel | 'all'; label: string; count: number; forYou: boolean }> = [
      { value: 'all', label: 'All', count: all, forYou: false },
      ...levels.filter(l => counts[l] > 0).map(l => ({
        value: l as CefrLevel | 'all',
        label: l,
        count: counts[l],
        forYou: l === suggested && suggestedHasCollections,
      })),
    ];
    // Move the suggested level to the front (after All) only when it has collections
    if (suggestedHasCollections) {
      const idx = opts.findIndex(o => o.value === suggested);
      if (idx > 1) {
        const [item] = opts.splice(idx, 1);
        opts.splice(1, 0, item);
      }
    }
    return opts;
  });

  // ─── Segment switching ────────────────────────────────────────────────────────

  switchSegment(seg: ActiveSegment): void {
    this.activeSegment.set(seg);
    if (seg === 'explore') {
      // Always reload — cheap GET, ensures newly-published collections appear
      // without requiring the user to kill and reopen the app.
      this.platformStore.loadCollections();
    }
  }

  // ─── My Sets actions ──────────────────────────────────────────────────────────

  openDetail(col: Collection): void {
    this.router.navigate(['/vault/collections', col.id]);
  }

  goBack(): void { this.router.navigate(['/vault']); }

  navigateToImport(): void { this.router.navigate(['/vault/import']); }

  async openCreateSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
      componentProps: { autoConfirmOnCreate: true },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    this.store.loadCollections();
    if (data?.collectionId) await this._promptImportAfterCreate(data.collectionId);
  }

  progressPercent(col: Collection): number {
    if (!col.cardCount) return 0;
    return Math.round((col.masteredCount / col.cardCount) * 100);
  }

  // ─── Explore actions ──────────────────────────────────────────────────────────

  setLevel(level: CefrLevel | 'all'): void {
    this.platformStore.setLevel(level);
  }

  setSearch(value: string): void {
    this.platformStore.setSearch(value);
  }

  openPlatformDetail(id: string): void {
    this.router.navigate(['/vault/collections/platform', id]);
  }

  openTopicSeeAll(topic: string): void {
    this.router.navigate(['/vault/explore/topic', encodeURIComponent(topic)]);
  }

  openAdoptedCollection(collectionId: string): void {
    this.router.navigate(['/vault/collections', collectionId]);
  }

  adoptCollection(col: PlatformCollectionSummary): void {
    this.platformStore.adopt(col.id);
  }

  readonly ringStyle = ringStyle;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async _promptImportAfterCreate(collectionId: string): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant('collections.afterCreate.title'),
      buttons: [
        { text: this.translate.instant('collections.afterCreate.csvOption'), icon: 'cloud-upload-outline', handler: () => this.router.navigate(['/vault/import']) },
        { text: this.translate.instant('collections.afterCreate.imageOption'), icon: 'cloud-upload-outline', handler: () => this.router.navigate(['/vault/import/image']) },
        { text: this.translate.instant('collections.afterCreate.goToOption'), handler: () => this.router.navigate(['/vault/collections', collectionId]) },
        { text: this.translate.instant('collections.afterCreate.laterOption'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async _toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 3500, color, position: 'bottom' });
    await t.present();
  }

}
