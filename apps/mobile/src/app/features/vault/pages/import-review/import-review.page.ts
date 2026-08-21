import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
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
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import type {
  Card,
  CardContent,
  ExampleSentence,
  GenderType,
  ParsedImportRow,
  WordDictionaryEntry,
} from '@lingua-card/shared/domain';
import { LanguageService } from '../../../../core/services/language.service';
import { CardApiService } from '../../services/card-api.service';
import { CollectionApiService } from '../../services/collection-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { ImportStateService } from '../../services/import-state.service';
import { DictionaryApiService } from '../../services/dictionary-api.service';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { CollectionAudioPrefetchService } from '../../../../shared/audio/collection-audio-prefetch.service';
import { catchError, forkJoin, map, of } from 'rxjs';

interface SelectableRow extends ParsedImportRow {
  selected: boolean;
  isDuplicate: boolean;
  duplicateCard: Card | null;
  duplicateSource: string | null;
  /** Platform dictionary entry for this word, if known. */
  dictionaryEntry: WordDictionaryEntry | null;
  /** Whether to reuse the platform entry (default: true when known). */
  reuseFromDictionary: boolean;
}

@Component({
  selector: 'lc-import-review',
  standalone: true,
  templateUrl: './import-review.page.html',
  styleUrls: ['./import-review.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportReviewPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly importState = inject(ImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly modalCtrl = inject(ModalController);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly dedupService = inject(CardDedupService);
  private readonly audioPrefetch = inject(CollectionAudioPrefetchService);
  private readonly dictionaryApi = inject(DictionaryApiService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  readonly importing = signal(false);
  readonly result = this.importState.result;
  readonly selectedCollectionId = signal<string | null>(null);
  readonly wordList = signal<SelectableRow[]>([]);

  readonly selectedCollectionLabel = computed(() => {
    this.languageService.current(); // re-evaluate label when UI language changes
    const id = this.selectedCollectionId();
    const noCol = this.translate.instant('importReview.collection.noSelectionLabel');
    if (!id) return noCol;
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : noCol;
  });

  readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
  readonly selectedCount = computed(() => this.selectedWords().length);
  readonly duplicateCount = computed(() => this.wordList().filter(w => w.isDuplicate).length);
  readonly vaultDuplicateCount = computed(() =>
    this.wordList().filter(w => w.isDuplicate && w.duplicateCard).length
  );
  readonly totalCount = computed(() => this.wordList().length);
  readonly reuseCount = computed(() =>
    this.wordList().filter(w => w.dictionaryEntry && w.reuseFromDictionary).length
  );
  readonly newEnrichCount = computed(() =>
    this.wordList().filter(w => w.selected && (!w.dictionaryEntry || !w.reuseFromDictionary) && !w.duplicateCard).length
  );

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
        dictionaryEntry: null,
        reuseFromDictionary: false,
      };
    });

    const vaultMatches = this.dedupService.checkBatch(
      withBatchDedup.map(r => ({ back: r.back, article: r.article ?? null })),
      freshCards,
    );

    const afterVaultDedup = withBatchDedup.map((row, i) => {
      const match = vaultMatches[i];
      if (match) {
        return { ...row, isDuplicate: true, duplicateCard: match, selected: false, duplicateSource: null };
      }
      return row;
    });

    this.wordList.set(afterVaultDedup);

    // Async: lookup platform dictionary, enrich row state
    const lookupWords = afterVaultDedup.map(r => ({
      back: r.back,
      article: r.article as 'der' | 'die' | 'das' | null ?? null,
    }));

    this.dictionaryApi.batchCheck(lookupWords).pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(() => of(null)),
    ).subscribe(result => {
      if (!result) return;
      const byKey = new Map<string, WordDictionaryEntry>();
      for (const entry of result.entries) {
        byKey.set(entry.lemmaKey, entry);
      }
      this.wordList.update(ws => ws.map(row => {
        const key = this._normalizeKey(row.article, row.back);
        const entry = byKey.get(key) ?? null;
        return { ...row, dictionaryEntry: entry, reuseFromDictionary: entry !== null };
      }));
    });
  }

  toggleWord(rowIndex: number): void {
    this.wordList.update(ws =>
      ws.map(w => w.rowIndex === rowIndex ? { ...w, selected: !w.selected } : w)
    );
  }

  toggleReuse(rowIndex: number): void {
    this.wordList.update(ws =>
      ws.map(w => w.rowIndex === rowIndex
        ? { ...w, reuseFromDictionary: !w.reuseFromDictionary }
        : w
      )
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
        message: this.translate.instant('importReview.errors.noCollectionSelected'),
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
        const dictReuseCount = this.reuseCount();

        const newCards = allCards.filter(c => newRows.some(r => r.back === c.content.back));
        this.audioPrefetch.prefetchCollection(newCards);

        let msg = `✓ ${newCount} ${this.translate.instant('importReview.success.newCardsSuffix')}`;
        if (dictReuseCount > 0) msg += `, ${dictReuseCount} ${this.translate.instant('importReview.success.dictReuseText')}`;
        if (reusedCount > 0) msg += `, ${reusedCount} ${this.translate.instant('importReview.success.existingText')}`;

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
          message: this.translate.instant('importReview.errors.importFailed'),
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
      return col
        ? this.translate.instant('srs.alreadyInCollection', { name: col.name })
        : this.translate.instant('srs.alreadyInVault');
    }
    return row.duplicateSource ?? this.translate.instant('srs.alreadyInVault');
  }

  private _normalizeKey(article: string | null | undefined, back: string): string {
    const articlePrefix = article ? `${article.toLowerCase()} ` : '';
    const base = back
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:"""''()]+$/, '')
      .replace(/[.,!?;:"""''()]+(?=\s)/g, '');
    if (articlePrefix && base.startsWith(articlePrefix)) return base;
    return `${articlePrefix}${base}`.trim();
  }

  private rowToContent(row: SelectableRow): CardContent {
    const gender: GenderType =
      row.article === 'der' ? 'masculine' :
      row.article === 'die' ? 'feminine' :
      row.article === 'das' ? 'neuter' : null;

    if (row.dictionaryEntry && row.reuseFromDictionary) {
      const entry = row.dictionaryEntry;
      const examples: ExampleSentence[] = entry.examples.length
        ? entry.examples
        : row.exampleTarget
          ? [{ id: crypto.randomUUID(), target: row.exampleTarget, native: row.exampleNative }]
          : [];
      return {
        front: entry.translation,
        back: entry.displayText,
        article: entry.article,
        gender: entry.gender,
        plural: entry.plurals[0] ?? null,
        examples,
        synonyms: entry.synonyms,
        notes: '',
        imageUrl: null,
        phonetic: entry.phonetic,
        dictionaryWordId: entry.id,
      };
    }

    const examples: ExampleSentence[] = row.exampleTarget
      ? [{ id: crypto.randomUUID(), target: row.exampleTarget, native: row.exampleNative }]
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
