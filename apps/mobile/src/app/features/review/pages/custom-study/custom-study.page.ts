import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import { isDue, isMastered, isNew, isStruggling, lifecycleState } from '../../domain/review-status';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';
import { CollectionPickerSheetComponent } from '../../components/collection-picker-sheet/collection-picker-sheet.component';
import { ReviewStore } from '../../store/review.store';
import { ReviewPrefsService, StudyDirection } from '../../services/review-prefs.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ReviewRoute } from '../../models/review.model';

type Pool = 'due' | 'new' | 'struggling' | 'learning' | 'mastered';
type StudyOrder = 'due' | 'hardest' | 'shuffle';

interface PoolOption {
  pool: Pool;
  labelKey: string;
}

const POOLS: PoolOption[] = [
  { pool: 'due', labelKey: 'review.custom.poolDue' },
  { pool: 'new', labelKey: 'review.custom.poolNew' },
  { pool: 'struggling', labelKey: 'review.custom.poolStruggling' },
  { pool: 'learning', labelKey: 'review.custom.poolLearning' },
  { pool: 'mastered', labelKey: 'review.custom.poolMastered' },
];

const ORDERS: { value: StudyOrder; labelKey: string }[] = [
  { value: 'due', labelKey: 'review.custom.orderDue' },
  { value: 'hardest', labelKey: 'review.custom.orderHardest' },
  { value: 'shuffle', labelKey: 'review.custom.orderShuffle' },
];

const DIRECTIONS: { value: StudyDirection; labelKey: string }[] = [
  { value: 'en-de', labelKey: 'review.custom.dirEnDe' },
  { value: 'de-en', labelKey: 'review.custom.dirDeEn' },
  { value: 'mixed', labelKey: 'review.custom.dirMixed' },
];

const LENGTH_MIN = 5;
const LENGTH_MAX = 50;
const LENGTH_STEP = 5;

@Component({
  selector: 'lc-custom-study',
  templateUrl: './custom-study.page.html',
  styleUrls: ['./custom-study.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, TranslatePipe],
})
export class CustomStudyPage {
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline });
  }

  readonly pools = POOLS;
  readonly orders = ORDERS;
  readonly directions = DIRECTIONS;
  readonly lengthMin = LENGTH_MIN;
  readonly lengthMax = LENGTH_MAX;
  readonly lengthStep = LENGTH_STEP;

  readonly selected = signal<Set<Pool>>(new Set<Pool>(['due']));
  readonly length = signal(20);
  readonly order = signal<StudyOrder>('due');
  readonly dir = this.prefs.dir;

  // ─── Collection source ──────────────────────────────────────────────────────
  // Empty set = all collections. Otherwise the pools draw only from the selected
  // collections' cards.
  readonly selectedCollectionIds = signal<Set<string>>(new Set<string>());

  readonly collectionOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.cardStore.cards()) {
      if (c.collectionId) counts.set(c.collectionId, (counts.get(c.collectionId) ?? 0) + 1);
    }
    return this.collectionStore
      .collections()
      .map(col => ({ id: col.id, name: col.name, emoji: col.emoji ?? '📚', count: counts.get(col.id) ?? 0 }))
      .filter(c => c.count > 0);
  });

  /** Cards that feed the pools — all cards, or only the selected collections'. */
  private readonly sourceCards = computed<ScheduledCard[]>(() => {
    const ids = this.selectedCollectionIds();
    const all = this.cardStore.cards();
    if (ids.size === 0) return all;
    return all.filter(c => !!c.collectionId && ids.has(c.collectionId));
  });

  /** Summary shown on the source row: "All collections", a single name, or a count. */
  readonly collectionSummary = computed(() => {
    const ids = this.selectedCollectionIds();
    if (ids.size === 0) return this.translate.instant('review.custom.allCollections');
    if (ids.size === 1) {
      const opt = this.collectionOptions().find(c => ids.has(c.id));
      if (opt) return `${opt.emoji} ${opt.name}`.trim();
    }
    return this.translate.instant('review.custom.collectionsCount', { count: ids.size });
  });

  async openCollectionPicker(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: CollectionPickerSheetComponent,
      componentProps: {
        initialSelectedIds: [...this.selectedCollectionIds()],
        // Apply live so the selection reflects regardless of how the sheet closes.
        onSelectionChange: (ids: string[]) => this.selectedCollectionIds.set(new Set(ids)),
      },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: true,
    });
    await modal.present();
  }

  private poolCards(pool: Pool, now: Date): ScheduledCard[] {
    const cards = this.sourceCards();
    switch (pool) {
      case 'due': return cards.filter(c => isDue(c, now));
      case 'new': return cards.filter(isNew);
      case 'struggling': return cards.filter(isStruggling);
      case 'learning': return cards.filter(c => lifecycleState(c) === 'learning');
      case 'mastered': return cards.filter(isMastered);
    }
  }

  readonly poolCounts = computed<Record<Pool, number>>(() => {
    const now = new Date();
    return {
      due: this.poolCards('due', now).length,
      new: this.poolCards('new', now).length,
      struggling: this.poolCards('struggling', now).length,
      learning: this.poolCards('learning', now).length,
      mastered: this.poolCards('mastered', now).length,
    };
  });

  private readonly matchingCards = computed<ScheduledCard[]>(() => {
    const now = new Date();
    const byId = new Map<string, ScheduledCard>();
    for (const pool of this.selected()) {
      for (const c of this.poolCards(pool, now)) byId.set(c.id, c);
    }
    return [...byId.values()];
  });

  readonly matchingCount = computed(() => this.matchingCards().length);
  readonly sessionCount = computed(() => Math.min(this.matchingCount(), this.length()));

  isSelected(pool: Pool): boolean {
    return this.selected().has(pool);
  }

  togglePool(pool: Pool): void {
    const next = new Set(this.selected());
    if (next.has(pool)) next.delete(pool);
    else next.add(pool);
    this.selected.set(next);
  }

  onLengthInput(event: Event): void {
    this.length.set(Number((event.target as HTMLInputElement).value));
  }

  setOrder(order: StudyOrder): void {
    this.order.set(order);
  }

  setDir(dir: StudyDirection): void {
    this.prefs.setDir(dir);
  }

  private orderQueue(cards: ScheduledCard[]): ScheduledCard[] {
    const copy = [...cards];
    switch (this.order()) {
      case 'due':
        return copy.sort((a, b) =>
          (a.reviewState.dueAt ?? '9999').localeCompare(b.reviewState.dueAt ?? '9999'),
        );
      case 'hardest':
        return copy.sort((a, b) => b.reviewState.totalAgainCount - a.reviewState.totalAgainCount);
      case 'shuffle':
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
  }

  async start(): Promise<void> {
    if (this.selected().size === 0 || this.sessionCount() === 0) {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('review.custom.pickAtLeastOne'),
        duration: 1700,
        position: 'bottom',
        cssClass: 'rv-toast',
      });
      await toast.present();
      return;
    }
    const queue = this.orderQueue(this.matchingCards()).slice(0, this.length());

    void this.reviewStore.startSession(
      { kind: 'custom', filters: { cardIds: queue.map(card => card.id) } },
      queue.length,
    ).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
  }

  goBack(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }
}
