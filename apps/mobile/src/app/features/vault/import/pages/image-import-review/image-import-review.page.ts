import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  checkmarkCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  Card,
  CardContent,
  ExampleSentence,
  GenderType,
  ImageExtractedWord,
  ParsedImportRow,
} from '@lingua-card/shared/domain';
import { generateUuid } from '@lingua-card/shared/utils';
import { catchError, firstValueFrom, forkJoin, map, of, switchMap } from 'rxjs';
import { CardApiService } from '../../../services/card-api.service';
import { CollectionApiService } from '../../../services/collection-api.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { CardStore } from '../../../store/card.store';
import { CollectionStore } from '../../../store/collection.store';
import { CategoryStore } from '../../../store/category.store';
import { AssignCollectionSheetComponent } from '../../../components/assign-collection-sheet/assign-collection-sheet.component';
import { ImageImportStateService } from '../../image-import-state.service';
import { CardDedupService } from '../../../../../shared/dedup/card-dedup.service';
import { CollectionAudioPrefetchService } from '../../../../../shared/audio/collection-audio-prefetch.service';
import { SubscriptionStore } from '../../../../subscription/store/subscription.store';

interface SelectableWord extends ParsedImportRow {
  id: number;
  selected: boolean;
  confidence: number;
  isDuplicate?: boolean;
  duplicateCard?: Card | null;
  duplicateCollectionName?: string | null;
}

@Component({
  selector: 'lc-image-import-review',
  standalone: true,
  templateUrl: './image-import-review.page.html',
  styleUrls: ['./image-import-review.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, TranslatePipe],
})
export class ImageImportReviewPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly importImageState = inject(ImageImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly modalCtrl = inject(ModalController);
  private readonly dedupService = inject(CardDedupService);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);
  private readonly subscriptionStore = inject(SubscriptionStore);
  private readonly translate = inject(TranslateService);

  readonly image      = this.importImageState.image;
  readonly result     = this.importImageState.result;
  readonly enrichment = this.importImageState.enrichment;

  readonly pendingCount = computed(() => this.enrichment()?.pending.length ?? 0);
  readonly totalFound   = computed(() => this.result()?.totalFound ?? 0);

  readonly wordList = signal<SelectableWord[]>([]);
  readonly selectedCollectionId = signal<string | null>(null);
  readonly importing = signal(false);
  /** True while the initial card-freshness fetch is in flight — prevents allPending() flicker. */
  private readonly initialising = signal(true);

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    const placeholder = this.translate.instant('imageImportReview.collection.selectPlaceholder');
    if (!id) return placeholder;
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : placeholder;
  });

  readonly duplicateCount = computed(() => this.wordList().filter(w => w.isDuplicate).length);
  readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
  readonly selectedCount = computed(() => this.selectedWords().length);
  readonly allSelected = computed(() => this.wordList().every(w => w.selected));
  readonly warningCount = computed(() => this.wordList().filter(w => w.confidence < 0.7).length);

  /** True when enrichment returned zero ready words — all words are pending.
   *  Guard with !initialising() so the banner doesn't flash during the card-freshness fetch. */
  readonly allPending = computed(() =>
    !this.initialising() && this.pendingCount() > 0 && this.wordList().length === 0,
  );

  /**
   * Pending-path duplicate count: how many raw pending words already exist in the vault.
   * Only meaningful when allPending() is true.
   * RawExtractedWord already has back + article from Phase 1, so CardDedupService can check them.
   */
  readonly pendingDuplicateCount = signal(0);

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, warningOutline });
  }

  ngOnInit(): void {
    // Need either enriched words or pending words to show this screen
    if (!this.result() && !this.enrichment()) {
      this.router.navigate(['/vault/import/image']);
      return;
    }

    // Fetch fresh cards once to avoid false vault-duplicate flags from stale
    // in-memory store state (e.g. after card deletions in this session).
    // takeUntilDestroyed cancels the subscription if the user navigates away
    // before the response arrives, preventing a post-destroy state mutation.
    this.cardApi.getAll().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: freshCards => {
        this._buildRows(freshCards);
        this.initialising.set(false);
        // Sync the store with the same fresh data — no second network call.
        this.cardStore.loadCards();
      },
      error: () => {
        // Offline / API unavailable — fall back to current store state so the
        // page stays functional. The dedup check may produce false positives
        // if the store is stale, but the user can still override manually.
        const fallback = this.cardStore.cards();
        this._buildRows(fallback);
        this.initialising.set(false);
      },
    });
  }

  private _buildRows(freshCards: Card[]): void {
    const words = this.result()?.words ?? [];
    const rows: SelectableWord[] = words.map((w, i) => ({
      ...this.toImportRow(w, i),
      id: i,
      selected: true,
      confidence: w.confidence,
    }));

    // Within-batch dedup: mark second occurrence of same word
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.article ?? ''}:${row.back.toLowerCase().trim()}`;
      if (seen.has(key)) {
        row.status = 'warning';
        row.warningMessages.push(
          this.translate.instant('imageImportReview.warnings.duplicateInImport', { row: seen.get(key)! + 1 }),
        );
      } else {
        seen.set(key, row.id);
      }
    }

    this.wordList.set(rows);
    this._checkVaultDuplicates(rows, freshCards);

    // For the all-pending path: use back-only dedup (no article) because:
    // 1. Phase 1 extraction embeds the article in back ("der Hund" not "Hund")
    // 2. The article from Phase 1 AI extraction is unconfirmed — unreliable as a key
    // checkBatchByBackOnly strips article prefixes and matches on the bare word only.
    const pendingWords = this.enrichment()?.pending ?? [];
    if (pendingWords.length > 0 && rows.length === 0) {
      const matches = this.dedupService.checkBatchByBackOnly(pendingWords, freshCards);
      this.pendingDuplicateCount.set(matches.filter(m => m !== null).length);
    }
  }

  private _checkVaultDuplicates(rows: SelectableWord[], freshCards: Card[]): void {
    const matches = this.dedupService.checkBatch(
      rows.map(r => ({ back: r.back, article: r.article ?? null })),
      freshCards,
    );
    this.wordList.update(ws =>
      ws.map((w, i) => {
        const match = matches[i];
        if (!match) return w;
        return {
          ...w,
          isDuplicate: true,
          duplicateCard: match,
          duplicateCollectionName: match.collectionId ?? null,
          selected: false,
          status: 'warning' as const,
          warningMessages: [...w.warningMessages, this.translate.instant('imageImportReview.warnings.alreadyInVault')],
        };
      }),
    );
  }

  toggleWord(id: number): void {
    this.wordList.update(ws =>
      ws.map(w => w.id === id ? { ...w, selected: !w.selected } : w)
    );
  }

  toggleAll(): void {
    const allSelected = this.allSelected();
    this.wordList.update(ws => ws.map(w => ({ ...w, selected: !allSelected })));
  }

  async openCollectionSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
      componentProps: { selectedCollectionId: this.selectedCollectionId(), required: true },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data && 'collectionId' in data) {
      this.selectedCollectionId.set(data.collectionId);
    }
  }

  async confirmImport(): Promise<void> {
    if (this.importing() || !this.selectedCollectionId()) return;

    // All-pending case: no enriched words at all — mark the collection incomplete and bail
    if (this.allPending()) {
      await this.saveAllPending();
      return;
    }

    const rows = this.selectedWords();
    if (!rows.length) return;

    this.importing.set(true);
    const collectionId = this.selectedCollectionId()!;
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();
    const pending = this.enrichment()?.pending ?? [];

    // Split: rows with an existing duplicate card get assigned; others get created
    const newRows = rows.filter(r => !r.duplicateCard);
    const reuseRows = rows.filter(r => !!r.duplicateCard);

    const createRequests = newRows.map(row =>
      this.cardApi.create({
        deckId: 'deck-001',
        collectionId,
        userId,
        contextId: 'german-vocab',
        content: this.rowToContent(row),
        categoryIds: row.categoryId ? [row.categoryId] : [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
      }).pipe(catchError(() => of(null)))
    );

    const assignRequests = reuseRows.map(row =>
      this.collectionApi.addExistingCard(collectionId, row.duplicateCard!.id).pipe(
        map(() => row.duplicateCard!),
        catchError(() => of(null)),
      )
    );

    const allRequests = [...createRequests, ...assignRequests];

    forkJoin(allRequests.length ? allRequests : [of(null)]).pipe(
      map(results => results.filter((r): r is Card => r !== null)),
      switchMap(allCards => {
        // If there are pending words, mark the collection as incomplete after cards are saved
        if (pending.length > 0) {
          return this.collectionApi.markIncomplete(collectionId, pending).pipe(
            map(() => allCards),
            catchError(() => of(allCards)),
          );
        }
        return of(allCards);
      }),
    ).subscribe({
      next: async allCards => {
        this.importing.set(false);
        this.importImageState.clear();
        this.cardStore.loadCards();
        this.collectionStore.loadCollections();
        this.subscriptionStore.onImageImported();

        const newCards = allCards.filter(c => newRows.some(r => r.back === c.content.back));
        // Fire-and-forget: pre-generate audio for newly created cards only
        this.audioPrefetch.prefetchCollection(newCards);

        const created = newCards.length;
        const reused = reuseRows.length;
        const hasPending = pending.length > 0;
        const toast = await this.toastCtrl.create({
          message: hasPending
            ? this.translate.instant('imageImportReview.toast.pendingSuccess', { created, pending: pending.length })
            : reused > 0
              ? this.translate.instant('imageImportReview.toast.reusedSuccess', { created, reused })
              : this.translate.instant('imageImportReview.toast.addedSuccess', { created }),
          duration: 3500,
          position: 'bottom',
          color: hasPending ? 'warning' : 'success',
        });
        await toast.present();
        this.router.navigate(['/vault/collections', collectionId]);
      },
      error: async () => {
        this.importing.set(false);
        const toast = await this.toastCtrl.create({
          message: this.translate.instant('imageImportReview.toast.importFailed'),
          duration: 3000,
          position: 'bottom',
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  private async saveAllPending(): Promise<void> {
    const collectionId = this.selectedCollectionId()!;
    const pending = this.enrichment()?.pending ?? [];
    if (!pending.length) return;

    this.importing.set(true);
    try {
      await firstValueFrom(this.collectionApi.markIncomplete(collectionId, pending));
      this.importImageState.clear();
      this.collectionStore.loadCollections();
      this.subscriptionStore.onImageImported();
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('imageImportReview.toast.collectionSaved', { count: pending.length }),
        duration: 4000,
        position: 'bottom',
        color: 'warning',
      });
      await toast.present();
      this.router.navigate(['/vault/collections', collectionId]);
    } catch {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('imageImportReview.toast.saveFailed'),
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.importing.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/vault/import/image']);
  }

  cancel(): void {
    this.importImageState.clear();
    this.router.navigate(['/vault']);
  }

  private toImportRow(word: ImageExtractedWord, index: number): ParsedImportRow {
    const cat = this.categoryStore.categories()
      .find(c => c.name.toLowerCase() === word.categoryName.toLowerCase());

    return {
      rowIndex: index + 1,
      front: word.front,
      back: word.back,
      article: word.article,
      categoryId: cat?.id ?? '',
      exampleTarget: word.exampleTarget,
      exampleNative: word.exampleNative,
      plural: word.plural,
      synonyms: word.synonyms,
      status: word.confidence >= 0.6 ? 'valid' : 'warning',
      warningMessages: word.confidence < 0.6 ? [this.translate.instant('imageImportReview.warnings.lowConfidence')] : [],
      errorMessages: [],
    };
  }

  private rowToContent(row: ParsedImportRow): CardContent {
    const gender: GenderType =
      row.article === 'der' ? 'masculine' :
      row.article === 'die' ? 'feminine' :
      row.article === 'das' ? 'neuter' : null;
    const examples: ExampleSentence[] = row.exampleTarget
      ? [{ id: generateUuid(), target: row.exampleTarget, native: row.exampleNative }]
      : [];
    return {
      front: row.front,
      back: row.back,
      article: row.article,
      gender,
      plural: row.plural ?? null,
      examples,
      synonyms: row.synonyms ?? [],
      notes: '',
      imageUrl: null,
      phonetic: null,
    };
  }
}
