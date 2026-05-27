import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  closeOutline,
  micOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import { ArticleType, CardContent, ExampleSentence } from '../../../../core/models/mock-data';
import { AudioService } from '../../../../core/services/audio.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../../../core/store/card.store';
import { CategoryStore } from '../../../../core/store/category.store';
import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from '../assign-collection-sheet/assign-collection-sheet.component';

@Component({
  selector: 'app-add-word-sheet',
  standalone: true,
  templateUrl: './add-word-sheet.component.html',
  styleUrls: ['./add-word-sheet.component.scss', './add-word-sheet.fields.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule],
})
export class AddWordSheetComponent implements OnInit {
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly audioService = inject(AudioService);
  private readonly authService = inject(AuthService);
  private readonly cardStore = inject(CardStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);

  @Input() lockedCollectionId: string | null = null;

  readonly form = new FormGroup({
    front: new FormControl('', [Validators.required]),
    back: new FormControl('', [Validators.required]),
    article: new FormControl<ArticleType | null>(null),
    categoryId: new FormControl(''),
    collectionId: new FormControl<string | null>(null, [Validators.required]),
    exampleTarget: new FormControl(''),
    exampleNative: new FormControl(''),
  });

  readonly selectedCollectionLabel = computed(() => {
    const id = this.form.get('collectionId')!.value;
    if (!id) return 'No collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'No collection';
  });

  readonly categories = this.categoryStore.categories;
  readonly saving = signal(false);
  readonly articles: ArticleType[] = ['der', 'die', 'das'];

  ngOnInit(): void {
    if (this.lockedCollectionId) {
      this.form.patchValue({ collectionId: this.lockedCollectionId });
    }
  }

  constructor() {
    addIcons({ closeOutline, micOutline, volumeHighOutline, addOutline });

    this.form.get('back')!.valueChanges.pipe(
      takeUntilDestroyed(),
    ).subscribe(val => {
      const lower = (val ?? '').toLowerCase();
      const prefixes: Array<[string, ArticleType]> = [
        ['der ', 'der'], ['die ', 'die'], ['das ', 'das'],
      ];
      for (const [prefix, art] of prefixes) {
        if (lower.startsWith(prefix)) {
          this.form.patchValue(
            { article: art, back: val!.substring(4) },
            { emitEvent: false },
          );
          return;
        }
      }
    });
  }

  selectArticle(art: ArticleType): void {
    const current = this.form.get('article')!.value;
    this.form.patchValue({ article: current === art ? null : art });
  }

  selectCategory(id: string): void {
    const current = this.form.get('categoryId')!.value;
    this.form.patchValue({ categoryId: current === id ? '' : id });
  }

  playTTS(): void {
    const word = this.form.get('back')!.value?.trim();
    if (!word) return;
    const article = this.form.get('article')!.value;
    this.audioService.speak(article ? `${article} ${word}` : word, 'de-DE').subscribe({ error: () => {} });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const examples: ExampleSentence[] = [];
    if (v.exampleTarget?.trim()) {
      examples.push({
        id: crypto.randomUUID(),
        target: v.exampleTarget.trim(),
        native: v.exampleNative?.trim() ?? '',
      });
    }

    const art = v.article ?? null;
    const content: CardContent = {
      front: v.front!.trim(),
      back: v.back!.trim(),
      article: art,
      gender: art === 'der' ? 'masculine'
        : art === 'die' ? 'feminine'
        : art === 'das' ? 'neuter'
        : null,
      examples,
      notes: '',
      audioAssetId: null,
      imageUrl: null,
      phonetic: null,
    };

    const categoryIds = v.categoryId ? [v.categoryId] : [];
    const now = new Date().toISOString();

    const userId = this.authService.currentUser()?.id ?? '';
    this.cardStore.createCard({
      deckId: 'deck-001',
      collectionId: v.collectionId ?? null,
      userId,
      contextId: 'german-vocab',
      content,
      categoryIds,
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
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalCtrl.dismiss({ created: true });
      },
      error: () => this.saving.set(false),
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  async openCollectionSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
      componentProps: { selectedCollectionId: this.form.get('collectionId')!.value, required: true },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data && 'collectionId' in data) {
      this.form.patchValue({ collectionId: data.collectionId });
    }
  }

  navigateToImport(): void {
    this.modalCtrl.dismiss();
    this.router.navigate(['/vault/import']);
  }
}
