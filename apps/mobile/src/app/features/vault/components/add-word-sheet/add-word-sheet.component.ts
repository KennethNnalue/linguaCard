import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs/operators';
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
import type { ArticleType, Card, CardContent, ExampleSentence } from '@lingua-card/shared/domain';
import { UpdateCardDto } from '@lingua-card/shared/dto';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardStore } from '../../store/card.store';
import { CardApiService } from '../../services/card-api.service';
import { CategoryStore } from '../../store/category.store';
import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from '../assign-collection-sheet/assign-collection-sheet.component';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';

@Component({
  selector: 'lc-add-word-sheet',
  templateUrl: './add-word-sheet.component.html',
  styleUrls: ['./add-word-sheet.component.scss', './add-word-sheet.fields.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule],
})
export class AddWordSheetComponent implements OnInit {
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly authService = inject(AuthService);
  private readonly cardStore = inject(CardStore);
  private readonly cardApi = inject(CardApiService);
  private readonly modalCtrl = inject(ModalController);
  private readonly router = inject(Router);
  private readonly dedupService = inject(CardDedupService);

  readonly lockedCollectionId = input<string | null>(null);
  readonly cardToEdit = input<Card | null>(null);

  readonly isEditing = computed(() => !!this.cardToEdit());

  readonly form = new FormGroup({
    front: new FormControl('', [Validators.required]),
    back: new FormControl('', [Validators.required]),
    article: new FormControl<ArticleType | null>(null),
    plural: new FormControl(''),
    categoryId: new FormControl(''),
    collectionId: new FormControl<string | null>(null, [Validators.required]),
    exampleTarget: new FormControl(''),
    exampleNative: new FormControl(''),
  });

  private readonly _collectionId = toSignal(
    this.form.get('collectionId')!.valueChanges,
    { initialValue: this.form.get('collectionId')!.value },
  );

  // Writable signal so ngOnInit can seed it from cardToEdit without relying on
  // valueChanges (which patchValue with emitEvent:false would suppress).
  private readonly _article = signal<ArticleType | null>(null);

  readonly showPluralField = computed(() => !!this._article());

  readonly selectedCollectionLabel = computed(() => {
    const id = this._collectionId();
    if (!id) return 'No collection';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'No collection';
  });

  readonly categories = this.categoryStore.categories;
  readonly saving = signal(false);
  readonly articles: ArticleType[] = ['der', 'die', 'das'];
  readonly duplicateCard = signal<Card | null>(null);
  readonly suppressDuplicateWarning = signal(false);
  readonly showNewCategoryInput = signal(false);
  readonly newCategoryName = signal('');

  ngOnInit(): void {
    const card = this.cardToEdit();
    if (card) {
      const c = card.content;
      const ex = c.examples?.[0];
      this.form.patchValue({
        front: c.front,
        back: c.back,
        article: c.article ?? null,
        plural: c.plural ?? '',
        categoryId: card.categoryIds?.[0] ?? '',
        collectionId: card.collectionId ?? null,
        exampleTarget: ex?.target ?? '',
        exampleNative: ex?.native ?? '',
      }, { emitEvent: false });
      // Seed _article from card so showPluralField is correct immediately —
      // patchValue with emitEvent:false would otherwise leave it null.
      this._article.set(c.article ?? null);
    } else if (this.lockedCollectionId()) {
      this.form.patchValue({ collectionId: this.lockedCollectionId() });
    }
  }

  constructor() {
    addIcons({ closeOutline, micOutline, volumeHighOutline, addOutline });

    // Duplicate check: synchronous O(1) lookup — no debounce needed.
    this.form.get('back')!.valueChanges.pipe(
      takeUntilDestroyed(),
      distinctUntilChanged(),
    ).subscribe(() => this._checkDuplicate());

    this.form.get('article')!.valueChanges.pipe(
      takeUntilDestroyed(),
    ).subscribe(() => this._checkDuplicate());

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
          this._article.set(art);
          return;
        }
      }
    });
  }

  selectArticle(art: ArticleType | null): void {
    this.form.patchValue({ article: art });
    this._article.set(art);
  }

  selectCategory(id: string): void {
    const current = this.form.get('categoryId')!.value;
    this.form.patchValue({ categoryId: current === id ? '' : id });
  }

  toggleNewCategoryInput(): void {
    this.showNewCategoryInput.update(v => !v);
    if (!this.showNewCategoryInput()) this.newCategoryName.set('');
  }

  addNewCategory(): void {
    const name = this.newCategoryName().trim();
    if (!name) return;
    this.categoryStore.createCategory({ name });
    // Select the category once it appears — watch for the next emission
    const sub = this.categoryStore.categories;
    const before = new Set(sub().map(c => c.id));
    const check = setInterval(() => {
      const added = sub().find(c => !before.has(c.id));
      if (added) {
        clearInterval(check);
        this.form.patchValue({ categoryId: added.id });
        this.newCategoryName.set('');
        this.showNewCategoryInput.set(false);
      }
    }, 100);
    setTimeout(() => clearInterval(check), 5000);
  }

  private _checkDuplicate(): void {
    const back = this.form.get('back')!.value?.trim();
    if (!back) {
      this.duplicateCard.set(null);
      return;
    }
    const article = this.form.get('article')!.value ?? null;
    const selfId = this.cardToEdit()?.id;

    // Full-key lookup first (article + back). Covers enriched cards from any entry
    // point (manual add, CSV, image import) where article is confirmed.
    let found = this.dedupService.check(article, back);

    // Fallback to back-only lookup when:
    //   - Full-key missed (no match with this article)
    //   - The existing vault card may have a different or missing article
    //     (e.g. verbs stored without article, or article-mismatch from Phase 1 import)
    if (!found || found.id === selfId) {
      found = this.dedupService.checkByBackOnly(back) ?? found;
    }

    // Suppress if the only match is the card currently being edited
    const isDuplicate = found && found.id !== selfId;
    this.suppressDuplicateWarning.set(false);
    this.duplicateCard.set(isDuplicate ? found : null);
  }

  dismissDuplicateWarning(): void {
    this.suppressDuplicateWarning.set(true);
  }

  goToExisting(): void {
    const id = this.duplicateCard()?.id;
    if (!id) return;
    this.modalCtrl.dismiss();
    this.router.navigate(['/vault/word', id]);
  }

  readonly showDuplicateWarning = computed(() =>
    !this.suppressDuplicateWarning() && !!this.duplicateCard(),
  );

  /** Collection name of the duplicate, e.g. "Tiere (Chapter 3)". Null if no collection. */
  readonly duplicateCollectionName = computed(() => {
    const card = this.duplicateCard();
    if (!card?.collectionId) return null;
    const col = this.collectionStore.collections().find(c => c.id === card.collectionId);
    return col ? `${col.emoji ? col.emoji + ' ' : ''}${col.name}` : null;
  });

  playTTS(): void {
    const word = this.form.get('back')!.value?.trim();
    if (!word) return;
    const article = this.form.get('article')!.value;
    void this.wordAudio.play(article ? `${article} ${word}` : word, 'de-DE');
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const examples: ExampleSentence[] = [];
    if (v.exampleTarget?.trim()) {
      examples.push({
        id: this.cardToEdit()?.content.examples?.[0]?.id ?? crypto.randomUUID(),
        target: v.exampleTarget.trim(),
        native: v.exampleNative?.trim() ?? '',
      });
    }

    const card = this.cardToEdit();
    const art = v.article ?? null;
    const content: CardContent = {
      front: v.front!.trim(),
      back: v.back!.trim(),
      article: art,
      gender: art === 'der' ? 'masculine'
        : art === 'die' ? 'feminine'
        : art === 'das' ? 'neuter'
        : null,
      plural: (art && v.plural?.trim()) ? v.plural.trim() : null,
      examples,
      synonyms: card?.content.synonyms ?? [],
      notes: card?.content.notes ?? '',
      audioAssetId: card?.content.audioAssetId ?? null,
      imageUrl: card?.content.imageUrl ?? null,
      phonetic: card?.content.phonetic ?? null,
    };

    const categoryIds = v.categoryId ? [v.categoryId] : [];

    if (this.isEditing()) {
      const dto: UpdateCardDto = {
        content,
        categoryIds,
        collectionId: v.collectionId ?? null,
      };
      this.cardApi.update(card!.id, dto).subscribe({
        next: (updated) => {
          this.cardStore.updateCard(updated);
          this.saving.set(false);
          this.modalCtrl.dismiss({ created: true });
        },
        error: () => this.saving.set(false),
      });
      return;
    }

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
