import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { CardContent, ExampleSentence, GenderType, ParsedImportRow } from '@lingua-card/shared/domain';
import type { Card } from '@lingua-card/shared/domain';
import { CardApiService } from '../../services/card-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { ImportStateService } from '../../services/import-state.service';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { CollectionAudioPrefetchService } from '../../../../shared/audio/collection-audio-prefetch.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface SelectableRow extends ParsedImportRow {
  selected: boolean;
  isDuplicate: boolean;
  duplicateCard: Card | null;
  duplicateSource: string | null;
}

@Component({
  selector: 'lc-import-review',
  standalone: true,
  templateUrl: './import-review.page.html',
  styleUrls: ['./import-review.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImportReviewPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly importState = inject(ImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly dedupService = inject(CardDedupService);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);

  readonly importing = signal(false);
  readonly result = this.importState.result;
  readonly selectedCollectionId = signal<string | null>(null);
  readonly wordList = signal<SelectableRow[]>([]);

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'No collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'No collection';
  });

  readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
  readonly selectedCount = computed(() => this.selectedWords().length);
  readonly duplicateCount = computed(() => this.wordList().filter(w => w.isDuplicate).length);
  readonly vaultDuplicateCount = computed(() =>
    this.wordList().filter(w => w.isDuplicate && w.duplicateCard).length
  );
  readonly totalCount = computed(() => this.wordList().length);

  // Keep backward-compat computed values for template
  readonly readyCount = computed(() => this.selectedCount());
  readonly warningCount = computed(() => this.result()?.warningCount ?? 0);
  readonly errorCount = computed(() => this.result()?.errorRows.length ?? 0);
  readonly first4Rows = computed(() => (this.result()?.validRows ?? []).slice(0, 4));

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, warningOutline });
  }

  ngOnInit(): void {
    if (!this.importState.result()) {
      this.router.navigate(['/vault/import']);
      return;
    }
    // Fetch fresh cards to ensure vault-dedup uses current state (not stale
    // in-memory store — e.g. after card deletions in this session).
    this.cardApi.getAll().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: freshCards => {
        this._buildWordList(freshCards);
        this.cardStore.loadCards();
      },
      error: () => this._buildWordList(this.cardStore.cards()),
    });
  }

  private _buildWordList(freshCards: Card[]): void {
    const rows = this.result()?.validRows ?? [];

    // Step 1: within-batch dedup — mark second occurrence of same word
    const batchSeen = new Map<string, number>();
    const withBatchDedup: SelectableRow[] = rows.map((row, i) => {
      const key = this._normalizeKey(row.article, row.back);
      let batchDup = false;
      let dupSource: string | null = null;
      if (batchSeen.has(key)) {
        batchDup = true;
        dupSource = `row ${batchSeen.get(key)! + 1} in this import`;
      } else {
        batchSeen.set(key, i);
      }
      return {
        ...row,
        selected: !batchDup,
        isDuplicate: batchDup,
        duplicateCard: null,
        duplicateSource: dupSource,
      };
    });

    // Step 2: vault dedup against fresh card list
    const vaultMatches = this.dedupService.checkBatch(
      withBatchDedup.map(r => ({ back: r.back, article: r.article ?? null })),
      freshCards,
    );

    const finalRows = withBatchDedup.map((row, i) => {
      const match = vaultMatches[i];
      if (match) {
        return {
          ...row,
          isDuplicate: true,
          duplicateCard: match,
          selected: false,
          duplicateSource: null,
        };
      }
      return row;
    });

    this.wordList.set(finalRows);
  }

  toggleWord(rowIndex: number): void {
    this.wordList.update(ws =>
      ws.map(w => w.rowIndex === rowIndex ? { ...w, selected: !w.selected } : w)
    );
  }

  suppressDuplicate(rowIndex: number): void {
    this.wordList.update(ws =>
      ws.map(w => w.rowIndex === rowIndex
        ? { ...w, selected: true, isDuplicate: false, duplicateCard: null }
        : w
      )
    );
  }

  async confirmImport(): Promise<void> {
    const rows = this.selectedWords();
    if (!rows.length || this.importing()) return;

    if (!this.selectedCollectionId()) {
      const toast = await this.toastCtrl.create({
        message: 'Please select a collection before importing.',
        duration: 2500,
        position: 'bottom',
        color: 'warning',
      });
      await toast.present();
      return;
    }

    this.importing.set(true);
    const collectionId = this.selectedCollectionId()!;
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();

    // Split: rows with an existing card get assigned (not re-created)
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
      this.collectionApi.addExistingCard(collectionId, row.duplicateCard!.id)
        .pipe(
          map(() => row.duplicateCard!),
          catchError(() => of(null)),
        )
    );

    const allRequests = [...createRequests, ...assignRequests];

    forkJoin(allRequests.length ? allRequests : [of(null)]).pipe(
      map(results => results.filter((r): r is Card => r !== null)),
    ).subscribe({
      next: async (allCards) => {
        this.importing.set(false);
        this.importState.clear();
        this.cardStore.loadCards();
        this.collectionStore.loadCollections();

        const newCount = allCards.filter(c => newRows.some(r => r.back === c.content.back)).length;
        const reusedCount = reuseRows.length;

        // Fire-and-forget: pre-generate audio for newly created cards only
        const newCards = allCards.filter(c => newRows.some(r => r.back === c.content.back));
        this.audioPrefetch.prefetchCollection(newCards);

        const msg = reusedCount > 0
          ? `✓ ${newCount} imported, ${reusedCount} already existed (reused)`
          : `✓ ${newCount} word${newCount === 1 ? '' : 's'} added to your Vault`;

        const toast = await this.toastCtrl.create({
          message: msg,
          duration: 3000,
          position: 'bottom',
          color: 'success',
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

  goBack(): void {
    this.router.navigate(['/vault/import']);
  }

  cancel(): void {
    this.importState.clear();
    this.router.navigate(['/vault']);
  }

  getDuplicateLabel(row: SelectableRow): string {
    if (row.duplicateCard) {
      const col = this.collectionStore.collections()
        .find(c => c.id === row.duplicateCard!.collectionId);
      return col ? `Already in "${col.name}"` : 'Already in your vault';
    }
    return row.duplicateSource ?? 'Duplicate';
  }

  private _normalizeKey(article: string | null | undefined, back: string): string {
    const w = back.toLowerCase().trim();
    const a = article?.toLowerCase().trim() ?? '';
    return a ? `${a} ${w}` : w;
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
      plural: null,
      examples,
      synonyms: [],
      notes: '',
      audioAssetId: null,
      imageUrl: null,
      phonetic: null,
    };
  }
}
