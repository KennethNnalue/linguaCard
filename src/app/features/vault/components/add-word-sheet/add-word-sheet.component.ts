import { Component, inject, signal } from '@angular/core';
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
import { MockAudioService, MockCardService, MockCategoryService } from '../../../../core/services/mock-services';
import { CardStore } from '../../../../core/store/card.store';

@Component({
  selector: 'app-add-word-sheet',
  standalone: true,
  templateUrl: './add-word-sheet.component.html',
  styleUrls: ['./add-word-sheet.component.scss', './add-word-sheet.fields.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule],
})
export class AddWordSheetComponent {
  private readonly cardService = inject(MockCardService);
  private readonly categoryService = inject(MockCategoryService);
  private readonly audioService = inject(MockAudioService);
  private readonly cardStore = inject(CardStore);
  private readonly modalCtrl = inject(ModalController);

  readonly form = new FormGroup({
    front: new FormControl('', [Validators.required]),
    back: new FormControl('', [Validators.required]),
    article: new FormControl<ArticleType | null>(null),
    categoryId: new FormControl(''),
    exampleTarget: new FormControl(''),
    exampleNative: new FormControl(''),
  });

  readonly categories = this.categoryService.categories;
  readonly saving = signal(false);

  readonly articles: ArticleType[] = ['der', 'die', 'das'];

  constructor() {
    addIcons({ closeOutline, micOutline, volumeHighOutline, addOutline });

    // Auto-detect article when user types "der/die/das <word>" in the back field
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
    this.audioService.speak(article ? `${article} ${word}` : word, 'de-DE').subscribe();
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const examples: ExampleSentence[] = [];
    if (v.exampleTarget?.trim()) {
      examples.push({
        id: Math.random().toString(36).slice(2),
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
    this.cardService.createCard(content, categoryIds).subscribe({
      next: () => {
        this.cardStore.loadCards();
        this.saving.set(false);
        this.modalCtrl.dismiss({ created: true });
      },
      error: () => this.saving.set(false),
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
