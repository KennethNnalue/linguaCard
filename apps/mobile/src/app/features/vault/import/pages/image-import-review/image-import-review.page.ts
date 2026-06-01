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
  CardContent,
  ExampleSentence,
  GenderType,
  ImageExtractedWord,
  ParsedImportRow,
} from '@lingua-card/shared/domain';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CardApiService } from '../../../services/card-api.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { CardStore } from '../../../store/card.store';
import { CollectionStore } from '../../../store/collection.store';
import { CategoryStore } from '../../../store/category.store';
import { AssignCollectionSheetComponent } from '../../../components/assign-collection-sheet/assign-collection-sheet.component';
import { ImageImportStateService } from '../../image-import-state.service';

interface SelectableWord extends ParsedImportRow {
  id: number;
  selected: boolean;
  confidence: number;
}

@Component({
  selector: 'app-image-import-review',
  standalone: true,
  templateUrl: './image-import-review.page.html',
  styleUrls: ['./image-import-review.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImageImportReviewPage implements OnInit {
  private readonly importImageState = inject(ImageImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);

  readonly image = this.importImageState.image;
  readonly result = this.importImageState.result;
  readonly wordList = signal<SelectableWord[]>([]);
  readonly selectedCollectionId = signal<string | null>(null);
  readonly importing = signal(false);

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'Select collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'Select collection';
  });

  readonly selectedWords = computed(() => this.wordList().filter(w => w.selected));
  readonly selectedCount = computed(() => this.selectedWords().length);
  readonly allSelected = computed(() => this.wordList().every(w => w.selected));
  readonly warningCount = computed(() => this.wordList().filter(w => w.confidence < 0.7).length);

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, warningOutline });
  }

  ngOnInit(): void {
    if (!this.result()) {
      this.router.navigate(['/vault/import/image']);
      return;
    }
    const words = this.result()!.words;
    this.wordList.set(words.map((w, i) => ({
      ...this.toImportRow(w, i),
      id: i,
      selected: true,
      confidence: w.confidence,
    })));
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
    const rows = this.selectedWords();
    if (!rows.length || this.importing() || !this.selectedCollectionId()) return;

    this.importing.set(true);
    const collectionId = this.selectedCollectionId();
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();

    const requests = rows.map(row =>
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

    forkJoin(requests).pipe(
      map(results => results.filter(r => r !== null).length),
    ).subscribe({
      next: async created => {
        this.importing.set(false);
        this.importImageState.clear();
        this.cardStore.loadCards();
        this.collectionStore.loadCollections();
        const toast = await this.toastCtrl.create({
          message: `✓ ${created} words added to your Vault`,
          duration: 3000,
          position: 'bottom',
          color: 'success',
        });
        await toast.present();
        this.router.navigate(['/vault']);
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
