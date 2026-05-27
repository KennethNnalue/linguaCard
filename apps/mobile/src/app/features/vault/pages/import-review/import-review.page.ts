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
import { CardContent, ExampleSentence, GenderType, ParsedImportRow } from '../../../../core/models/mock-data';
import { CardApiService } from '../../../../core/services/card-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../../../core/store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { ImportStateService } from '../../services/import-state.service';
import { AssignCollectionSheetComponent } from '../../components/assign-collection-sheet/assign-collection-sheet.component';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-import-review',
  standalone: true,
  templateUrl: './import-review.page.html',
  styleUrls: ['./import-review.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImportReviewPage implements OnInit {
  private readonly importState = inject(ImportStateService);
  private readonly cardApi = inject(CardApiService);
  private readonly authService = inject(AuthService);
  private readonly collectionStore = inject(CollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);

  readonly importing = signal(false);
  readonly result = this.importState.result;
  readonly selectedCollectionId = signal<string | null>(null);

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'No collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'No collection';
  });

  readonly readyCount = computed(() => this.result()?.validRows.length ?? 0);
  readonly warningCount = computed(() => this.result()?.warningCount ?? 0);
  readonly errorCount = computed(() => this.result()?.errorRows.length ?? 0);
  readonly first4Rows = computed(() => (this.result()?.validRows ?? []).slice(0, 4));

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline, warningOutline });
  }

  ngOnInit(): void {
    if (!this.importState.result()) {
      this.router.navigate(['/vault/import']);
    }
  }

  async confirmImport(): Promise<void> {
    const rows = this.result()?.validRows;
    if (!rows?.length || this.importing()) return;

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
        this.importState.clear();
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
