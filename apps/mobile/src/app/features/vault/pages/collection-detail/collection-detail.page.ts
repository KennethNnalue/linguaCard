import {Component, computed, effect, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {
  AlertController,
  IonContent,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import {TranslateService, TranslatePipe} from '@ngx-translate/core';
import {Card, Collection} from '@lingua-card/shared/domain';
import {isDue, isMastered} from '../../../../shared/srs/srs-status';
import {firstValueFrom} from 'rxjs';
import {CollectionApiService} from '../../services/collection-api.service';
import {CardStore} from '../../store/card.store';
import {CategoryStore} from '../../store/category.store';
import {CollectionStore} from '../../store/collection.store';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {FabButtonComponent} from '../../../../shared/components/fab-button/fab-button.component';
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewStore} from '../../../review/store/review.store';
import {ReviewLimit, ReviewRoute, ReviewSortOrder} from '../../../review/models/review.model';
import {WordRowComponent} from '../../components/word-row/word-row.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {AudioReadinessStore} from '../../../../shared/audio/audio-readiness.store';
import {CollectionAudioPrefetchService} from '../../../../shared/audio/collection-audio-prefetch.service';
import {normalizeForAudio} from '../../../../shared/audio/normalize';
import {ImageImportApiService} from '../../import/services/image-import-api.service';

@Component({
  selector: 'lc-collection-detail',
  standalone: true,
  templateUrl: './collection-detail.page.html',
  styleUrls: ['./collection-detail.page.scss'],
  imports: [IonContent, FabButtonComponent, WordRowComponent, TranslatePipe],
})
export class CollectionDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly audioReadiness = inject(AudioReadinessStore);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);
  private readonly importApi = inject(ImageImportApiService);
  private readonly translate = inject(TranslateService);
  private readonly cardStore = inject(CardStore);

  // Derived from the global CardStore — automatically reflects edits and deletes
  // made from word-detail without any manual reload.
  private readonly collectionId = signal<string | null>(null);

  readonly collection = signal<Collection | null>(null);
  readonly completing = signal(false);
  readonly justCompleted = signal(false);
  readonly allCards = computed(() => {
    const id = this.collectionId();
    if (!id) return [];
    return this.cardStore.cards().filter(c => c.collectionId === id);
  });
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
    return this.allCards().filter(c => isDue(c, now)).length;
  });

  readonly pendingGhosts = computed(() => {
    const count = this.collection()?.pendingWords.length ?? 0;
    return Array.from({length: Math.min(count, 5)}, (_, i) => i);
  });

  readonly ghostWidths: [string, string][] = [
    ['70px', '50px'],
    ['90px', '65px'],
    ['55px', '40px'],
  ];

  /**
   * Cache keys for all audio in this collection: one per word + one per example
   * sentence. Must exactly mirror the key set built by CollectionAudioPrefetchService
   * so that markReady() writes map to the same keys allSettled() reads.
   */
  private readonly _audioCacheKeys = computed(() => {
    const keys: string[] = [];
    for (const c of this.allCards()) {
      const wordText = (c.content.article ? `${c.content.article} ` : '') + c.content.back;
      keys.push(`wa-de-DE-${normalizeForAudio(wordText, 'de-DE')}`);
      for (const ex of c.content.examples ?? []) {
        if (ex.target?.trim()) {
          keys.push(`wa-de-DE-${normalizeForAudio(ex.target.trim(), 'de-DE')}`);
        }
      }
    }
    return keys;
  });

  readonly audioReadyCount = computed(() =>
    this.audioReadiness.readyCountFor(this._audioCacheKeys()),
  );

  readonly audioPrefetchActive = computed(() => {
    const keys = this._audioCacheKeys();
    if (!keys.length) return false;
    return !this.audioReadiness.allSettledFor(keys);
  });

  readonly masteredCount = computed(() =>
    this.allCards().filter(isMastered).length,
  );

  readonly progressPercent = computed(() => {
    const total = this.wordCount();
    if (!total) return 0;
    return Math.round((this.masteredCount() / total) * 100);
  });

  /** Cover gradient — hashed from the id so it matches the Vault shelf exactly,
   *  regardless of list order or filtering. */
  readonly coverClass = computed(() => {
    const id = this.collectionId() ?? '';
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return `cover-${(Math.abs(hash) % 6) + 1}`;
  });

  /** Topical eyebrow over the collection name (first category, else a generic label). */
  readonly eyebrow = computed(() => {
    const first = this.categoryIds()[0];
    return first
      ? getCategoryName(first, this.categories())
      : this.translate.instant('vault.lexicon.collectionEyebrow');
  });

  protected readonly getCategoryName = getCategoryName;

  private _audioPrefetched = false;

  constructor() {
    // Trigger audio prefetch once, the first time cards for this collection are
    // available in the store. Runs in the injection context so effect() is valid.
    effect(() => {
      const cards = this.allCards();
      if (cards.length > 0 && !this._audioPrefetched) {
        this._audioPrefetched = true;
        this.audioPrefetch.prefetchCollection(cards);
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.collectionId.set(id);

    // Prefer the store (already cached) to avoid an extra API call on every open.
    // Fall back to the API only when the collection is absent (deep-link / fresh device).
    const fromStore = this.collectionStore.collections().find(c => c.id === id) ?? null;
    if (fromStore) {
      this.collection.set(fromStore);
      this.loading.set(false);
    } else {
      this.collectionApi.getById(id).subscribe({
        next: col => { this.collection.set(col); this.loading.set(false); },
        error: () => this.goBack(),
      });
    }
  }

  async completeImport(): Promise<void> {
    const col = this.collection();
    if (!col || this.completing()) return;

    this.completing.set(true);
    try {
      const result = await firstValueFrom(this.importApi.completeCollection(col.id));

      const reused = result.reusedCards ?? 0;
      this.collection.update(c => c ? {
        ...c,
        importStatus: result.isComplete ? 'complete' : 'incomplete',
        pendingWords: result.pendingWords,
        cardCount: c.cardCount + result.newCards,
      } : c);

      // Reload cards + collections once after import — new cards arrived from the server
      this.cardStore.loadCards();
      this.collectionStore.loadCollections();

      if (result.isComplete) {
        this.justCompleted.set(true);
        setTimeout(() => this.justCompleted.set(false), 2000);
      }

      let message: string;
      if (!result.isComplete) {
        message = `✓ ${result.newCards} cards added — ${result.pendingWords.length} still pending`;
      } else if (reused > 0 && result.newCards > 0) {
        message = this.translate.instant('collectionDetail.importComplete.addedWithDuplicates', { added: result.newCards, duplicates: reused });
      } else if (reused > 0 && result.newCards === 0) {
        message = this.translate.instant('collectionDetail.importComplete.allAlreadyMessage', { count: reused });
      } else {
        message = this.translate.instant('collectionDetail.importComplete.allAddedMessage');
      }

      const toast = await this.toastCtrl.create({
        message,
        duration: 3500,
        color: result.isComplete ? 'success' : 'warning',
      });
      await toast.present();
    } catch {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('collectionDetail.importComplete.errorMessage'),
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.completing.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/vault']);
  }

  startReview(): void {
    const col = this.collection();
    if (!col) return;
    const useDue = this.dueCount() > 0;
    const queue = this.filterService.buildQueue({
      source: col.id,
      masteryLevels: [0, 1, 2, 3, 4, 5],
      sortOrder: useDue ? ReviewSortOrder.DUE_DATE : ReviewSortOrder.HARDEST,
      limit: ReviewLimit.DUE_TODAY,
    });
    if (!queue.length) return;
    const collectionName = `${col.emoji ?? ''} ${col.name}`.trim();
    this.reviewStore.startSession(queue, col.id, collectionName);
    this.router.navigate([ReviewRoute.PLAYER]);
  }

  startListen(): void {
    const col = this.collection();
    if (!col) return;
    this.router.navigate(['/listen'], {queryParams: {collectionId: col.id, collectionName: col.name}});
  }

  async openAddWord(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
      componentProps: {lockedCollectionId: col.id},
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.collectionId) {
      // Collection assignment changed on the new card — refresh collection counts
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
          text: this.translate.instant('collectionDetail.menu.clearAllOption'),
          role: 'destructive',
          handler: () => this.confirmClearWords(),
        }] : []),
        {
          text: this.translate.instant('collectionDetail.menu.deleteOption'),
          role: 'destructive',
          handler: () => this.confirmDelete(),
        },
        {text: this.translate.instant('collectionDetail.menu.cancelOption'), role: 'cancel'},
      ],
    });
    await alert.present();
  }

  private async confirmClearWords(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('collectionDetail.clearWords.title'),
      message: this.translate.instant('collectionDetail.clearWords.message', { count: this.wordCount(), name: col.name }),
      buttons: [
        {
          text: this.translate.instant('collectionDetail.clearWords.confirmButton'),
          role: 'destructive',
          handler: () => this.clearAllWords(),
        },
        {text: this.translate.instant('common.cancel'), role: 'cancel'},
      ],
    });
    await alert.present();
  }

  private clearAllWords(): void {
    const col = this.collection();
    if (!col) return;
    this.collectionApi.clearCards(col.id).subscribe(() => {
      // Remove all cards for this collection from the store optimistically
      this.cardStore.setCardsFromSync(
        this.cardStore.cards().filter(c => c.collectionId !== col.id),
      );
      // Update the collection's card count in-store
      this.collectionStore.setCollectionsFromSync(
        this.collectionStore.collections().map(c =>
          c.id === col.id ? { ...c, cardCount: 0, masteredCount: 0, dueCount: 0 } : c,
        ),
      );
      this.collection.update(c => c ? { ...c, cardCount: 0, masteredCount: 0, dueCount: 0 } : c);
    });
  }

  private async confirmDelete(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('collectionDetail.deleteCollection.title'),
      message: this.translate.instant('collectionDetail.deleteCollection.message'),
      buttons: [
        {
          text: this.translate.instant('collectionDetail.deleteCollection.confirmButton'),
          role: 'destructive',
          handler: () => {
            this.collectionStore.deleteCollection(col.id).subscribe();
            this.router.navigate(['/vault']);
          },
        },
        {text: this.translate.instant('common.cancel'), role: 'cancel'},
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

  playAudio(card: Card): void {
    void this.wordAudio.playCard(card);
  }

  getAudioStatus(card: Card) {
    const text = (card.content.article ? `${card.content.article} ` : '') + card.content.back;
    const key = `wa-de-DE-${normalizeForAudio(text, 'de-DE')}`;
    return this.audioReadiness.statusFor(key);
  }
}
