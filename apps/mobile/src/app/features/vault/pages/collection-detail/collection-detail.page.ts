import { AppNotificationService } from '@lingua-card/mobile/notifications';
import {Component, computed, effect, inject, OnInit, signal, untracked} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {
  ActionSheetButton,
  ActionSheetController,
  AlertController,
  IonContent,
  ModalController,
  } from '@ionic/angular/standalone';
import {TranslateService, TranslatePipe} from '@ngx-translate/core';
import {Card, CardView, Collection, ScheduledCard} from '@lingua-card/shared/domain';
import {firstValueFrom} from 'rxjs';
import {CollectionApiService} from '../../services/collection-api.service';
import {CardStore} from '../../store/card.store';
import {CollectionStore} from '../../store/collection.store';
import {AddWordSheetComponent} from '../../components/add-word-sheet/add-word-sheet.component';
import {FabButtonComponent} from '../../../../shared/components/fab-button/fab-button.component';
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewPlayerService} from '../../../review/services/review-player.service';
import {AudioReadinessStore} from '../../../../shared/audio/audio-readiness.store';
import {normalizeForAudio} from '../../../../shared/audio/normalize';
import {ImageImportApiService} from '../../import/services/image-import-api.service';
import {addIcons} from 'ionicons';
import {shareOutline, trashOutline, closeCircleOutline, syncOutline} from 'ionicons/icons';
import {ShareSheetComponent} from '../../../sharing/components/share-sheet/share-sheet.component';
import {ShareApiService} from '../../../sharing/services/share-api.service';
import {VocabularyPlayerService} from '../../../listen/services/vocabulary-player.service';
import {toVocabularyPlaylistItem} from '../../../listen/models/listen.models';
import {VaultV2Store} from '../../store/vault-v2.store';
import {CollectionCoverComponent} from '../../components/collection-cover/collection-cover.component';
import {CollectionAudioPrefetchService} from '../../../../shared/audio/collection-audio-prefetch.service';

@Component({
  selector: 'lc-collection-detail',
  standalone: true,
  templateUrl: './collection-detail.page.html',
  styleUrls: ['./collection-detail.page.scss'],
  imports: [IonContent, FabButtonComponent, TranslatePipe, CollectionCoverComponent],
})
export class CollectionDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly filterService = inject(ReviewFilterService);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly audioReadiness = inject(AudioReadinessStore);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);
  private readonly importApi = inject(ImageImportApiService);
  private readonly translate = inject(TranslateService);
  private readonly cardStore = inject(CardStore);
  private readonly shareApi = inject(ShareApiService);
  private readonly vocabularyPlayer = inject(VocabularyPlayerService);
  readonly vaultStore = inject(VaultV2Store);

  // Derived from the global CardStore — automatically reflects edits and deletes
  // made from word-detail without any manual reload.
  private readonly collectionId = signal<string | null>(null);

  readonly collection = signal<Collection | null>(null);
  readonly completing = signal(false);
  readonly justCompleted = signal(false);
  readonly allCards = computed(() => {
    const id = this.collectionId();
    if (!id) return [];
    return this.vaultStore.learningItems().filter(item => item.collectionIds.includes(id));
  });
  readonly loading = signal(true);
  readonly isSynced = signal(false);


  readonly wordCount = computed(() => this.allCards().length);

  readonly dueCount = computed(() => {
    const now = new Date();
    return this.allCards().filter(item => this.isViewDue(item.reviewState, now)).length;
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
    const keys = new Set<string>();
    for (const c of this.allCards()) {
      const locale = this.targetLocale();
      const article = c.lexeme.grammar['article'];
      const headword = typeof article === 'string' && article.trim()
        ? `${article.trim()} ${c.lexeme.text}`
        : c.lexeme.text;
      keys.add(`wa-${locale}-${normalizeForAudio(headword, locale)}`);
      for (const ex of c.examples) {
        if (ex.targetText.trim()) {
          keys.add(`wa-${locale}-${normalizeForAudio(ex.targetText.trim(), locale)}`);
        }
      }
    }
    return [...keys];
  });

  readonly audioClipCount = computed(() => this._audioCacheKeys().length);

  readonly audioReadyCount = computed(() =>
    this.audioReadiness.readyCountFor(this._audioCacheKeys()),
  );

  readonly audioPrefetchActive = computed(() => {
    const keys = this._audioCacheKeys();
    if (!keys.length) return false;
    return !this.audioReadiness.allSettledFor(keys);
  });

  readonly masteredCount = computed(() =>
    this.allCards().filter(item => item.reviewState.stage === 'mastered').length,
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

  readonly eyebrow = computed(() => this.translate.instant('vault.lexicon.collectionEyebrow'));

  constructor() {
    addIcons({shareOutline, trashOutline, closeCircleOutline, syncOutline});
    effect(() => {
      const items = this.allCards();
      const language = this.targetLocale();
      if (!items.length) return;
      untracked(() => this.audioPrefetch.prefetchLearningItems(items, language));
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.collectionId.set(id);
    this.vaultStore.ensureActiveVault();

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

    this.shareApi.checkSyncStatus(id).subscribe({
      next: ({ synced }) => this.isSynced.set(synced),
      error: () => {},
    });
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

  startDueReview(): void {
    const col = this.collection();
    if (!col) return;
    const now = new Date();
    void this.reviewPlayer.open(
      this.reviewCards().filter(card => this.isViewDue(card.reviewState, now)),
      { kind: 'collection', collectionId: col.id },
    );
  }

  startReviewAll(): void {
    const col = this.collection();
    if (!col) return;
    void this.reviewPlayer.open(this.reviewCards(), { kind: 'collection', collectionId: col.id });
  }

  startListen(): void {
    const col = this.collection();
    if (!col) return;
    void this.vocabularyPlayer.open({
      playlistId: `collection:${col.id}`,
      title: col.name,
      source: { kind: 'collection', collectionId: col.id },
      languages: {
        target: this.targetLocale(),
        native: this.sourceLocale(),
      },
      items: this.reviewCards().map(toVocabularyPlaylistItem),
    });
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

    const buttons: ActionSheetButton[] = [
      {
        text: this.translate.instant('collectionDetail.menu.shareOption'),
        icon: 'share-outline',
        handler: () => this.openShareSheet(),
      },
    ];

    if (this.isSynced()) {
      buttons.push({
        text: this.translate.instant('sharing.unsync.menuOption'),
        icon: 'sync-outline',
        handler: () => this.confirmUnsync(col.id),
      });
    }

    if (this.wordCount() > 0) {
      buttons.push({
        text: this.translate.instant('collectionDetail.menu.clearAllOption'),
        role: 'destructive',
        icon: 'trash-outline',
        handler: () => this.confirmClearWords(),
      });
    }

    buttons.push(
      {
        text: this.translate.instant('collectionDetail.menu.deleteOption'),
        role: 'destructive',
        icon: 'close-circle-outline',
        handler: () => this.confirmDelete(),
      },
      {text: this.translate.instant('collectionDetail.menu.cancelOption'), role: 'cancel'},
    );

    const sheet = await this.actionSheetCtrl.create({ header: col.name, buttons });
    await sheet.present();
  }

  private async confirmUnsync(resourceId: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('sharing.unsync.confirmHeader'),
      message: this.translate.instant('sharing.unsync.confirmMessage'),
      buttons: [
        {text: this.translate.instant('common.cancel'), role: 'cancel'},
        {
          text: this.translate.instant('sharing.unsync.confirmButton'),
          handler: async () => {
            await firstValueFrom(this.shareApi.unsync(resourceId));
            const toast = await this.toastCtrl.create({
              message: this.translate.instant('sharing.unsync.successToast'),
              duration: 2500,
            });
            await toast.present();
          },
        },
      ],
    });
    await alert.present();
  }

  private async openShareSheet(): Promise<void> {
    const col = this.collection();
    if (!col) return;
    const modal = await this.modalCtrl.create({
      component: ShareSheetComponent,
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
      componentProps: { resourceType: 'collection', resourceId: col.id },
    });
    await modal.present();
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

  openDetail(card: CardView): void {
    this.router.navigate(['/vault', card.id]);
  }

  coverSeed(): string {
    return this.vaultStore.vault()?.collections.find(item => item.id === this.collectionId())?.coverSeed
      ?? this.collection()?.name
      ?? '';
  }

  private reviewCards(): ScheduledCard[] {
    return this.allCards().map(item => this.toScheduledCard(item));
  }

  private toScheduledCard(item: CardView): ScheduledCard {
    const grammar = item.lexeme.grammar as { article?: Card['content']['article']; gender?: Card['content']['gender']; plurals?: string[] };
    return {
      id: item.id,
      deckId: '',
      collectionId: this.collectionId(),
      userId: '',
      contextId: item.learningContextId,
      dictionaryWordId: null,
      content: {
        front: item.localization.translation,
        back: item.lexeme.text,
        article: grammar.article ?? null,
        gender: grammar.gender ?? null,
        plural: grammar.plurals?.[0] ?? null,
        examples: item.examples.map(example => ({
          id: example.id,
          target: example.targetText,
          native: example.sourceText ?? '',
        })),
        synonyms: [],
        notes: item.personalNote,
        imageUrl: null,
        phonetic: item.lexeme.phonetic,
      },
      categoryIds: [],
      tags: [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      version: 1,
      reviewState: item.reviewState,
    };
  }

  private targetLocale(): string {
    const language = this.vaultStore.vault()?.learningContext.targetLanguage ?? 'de';
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    return locales[language] ?? language;
  }

  private sourceLocale(): string {
    const language = this.vaultStore.vault()?.learningContext.sourceLanguage ?? 'en';
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    return locales[language] ?? language;
  }

  private isViewDue(reviewState: CardView['reviewState'], now: Date): boolean {
    if (!reviewState.dueAt) return false;
    return reviewState.masterySource !== 'manual'
      && new Date(reviewState.dueAt).getTime() <= now.getTime();
  }
}
