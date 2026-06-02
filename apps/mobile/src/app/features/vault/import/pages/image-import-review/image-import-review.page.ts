import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  checkmarkCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import {
  Card,
  CardContent,
  ExampleSentence,
  GenderType,
  ImageExtractedWord,
  ParsedImportRow,
} from '@lingua-card/shared/domain';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImageImportReviewPage implements OnInit {
  private readonly importImageState = inject(ImageImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly dedupService = inject(CardDedupService);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);
  private readonly subscriptionStore = inject(SubscriptionStore);

  readonly image      = this.importImageState.image;
  readonly result     = this.importImageState.result;
  readonly enrichment = this.importImageState.enrichment;

  readonly pendingCount = computed(() => this.enrichment()?.pending.length ?? 0);
  readonly totalFound   = computed(() => this.result()?.totalFound ?? 0);

  readonly wordList = signal<SelectableWord[]>([]);
  readonly selectedCollectionId = signal<string | null>(null);
  readonly importing = signal(false);

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'Select collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'Select collection';
  });

  readonly duplicateCount = computed(() => this.wordList().filter(w => w.isDuplicate).length);
  readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
  readonly selectedCount = computed(() => this.selectedWords().length);
  readonly allSelected = computed(() => this.wordList().every(w => w.selected));
  readonly warningCount = computed(() => this.wordList().filter(w => w.confidence < 0.7).length);

  /** True when enrichment returned zero ready words — all words are pending */
  readonly allPending = computed(() => this.pendingCount() > 0 && this.wordList().length === 0);

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
        row.warningMessages.push(`Duplicate of row ${seen.get(key)! + 1} in this import`);
      } else {
        seen.set(key, row.id);
      }
    }

    this.wordList.set(rows);
    this._checkVaultDuplicates(rows);

    // For the all-pending path: use back-only dedup (no article) because:
    // 1. Phase 1 extraction embeds the article in back ("der Hund" not "Hund")
    // 2. The article from Phase 1 AI extraction is unconfirmed — unreliable as a key
    // checkBatchByBackOnly strips article prefixes and matches on the bare word only.
    const pendingWords = this.enrichment()?.pending ?? [];
    if (pendingWords.length > 0 && rows.length === 0) {
      const matches = this.dedupService.checkBatchByBackOnly(pendingWords);
      this.pendingDuplicateCount.set(matches.filter(m => m !== null).length);
    }
  }

  private _checkVaultDuplicates(rows: SelectableWord[]): void {
    const matches = this.dedupService.checkBatch(
      rows.map(r => ({ back: r.back, article: r.article ?? null })),
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
          warningMessages: [...w.warningMessages, 'Already in your vault'],
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
        srsState: {
          id: crypto.randomUUID(),
          cardId: '',
          userId,
          algorithm: 'sm2',
          intervalDays: 1,
          easeFactor: 2.5,
          repetitions: 0,
          lastRating: null,
          lastReviewedAt: null,
          nextDueAt: now,
          masteryLevel: 0,
          state: 'new',
        },
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
            ? `✓ ${created} cards added — ${pending.length} more will be generated later`
            : reused > 0
              ? `✓ ${created} imported, ${reused} already existed (reused)`
              : `✓ ${created} words added to your Vault`,
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
          message: 'Import failed. Please try again.',
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
        message: `Collection saved — tap "Complete" to generate ${pending.length} flashcards when ready`,
        duration: 4000,
        position: 'bottom',
        color: 'warning',
      });
      await toast.present();
      this.router.navigate(['/vault/collections', collectionId]);
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not save collection. Please try again.',
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
      status: word.confidence >= 0.6 ? 'valid' : 'warning',
      warningMessages: word.confidence < 0.6 ? ['Low confidence — please verify'] : [],
      errorMessages: [],
    };
  }

  private rowToContent(row: ParsedImportRow): CardContent {
    const gender: GenderType =
      row.article === 'der' ? 'masculine' :
      row.article === 'die' ? 'feminine' :
      row.article === 'das' ? 'neuter' : null;
    const examples: ExampleSentence[] = row.exampleTarget
      ? [{ id: crypto.randomUUID(), target: row.exampleTarget, native: row.exampleNative }]
      : [];
    return {
      front: row.front,
      back: row.back,
      article: row.article,
      gender,
      examples,
      notes: '',
      audioAssetId: null,
      imageUrl: null,
      phonetic: null,
    };
  }
}
