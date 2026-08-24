import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, Input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, of, switchMap } from 'rxjs';
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
  sparklesOutline,
  volumeHighOutline,
} from 'ionicons/icons';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import type { ArticleType, Card, CardContent, ExampleSentence, Synonym, WordDictionaryEntry } from '@lingua-card/shared/domain';
import { UpdateCardDto } from '@lingua-card/shared/dto';
import { generateUuid } from '@lingua-card/shared/utils';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LanguageService } from '../../../../core/services/language.service';
import { CardStore } from '../../store/card.store';
import { CardApiService } from '../../services/card-api.service';
import { VaultV2Store } from '../../store/vault-v2.store';
import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from '../assign-collection-sheet/assign-collection-sheet.component';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { EnrichOneApiService } from '../../import/services/enrich-one-api.service';
import { DictionaryApiService } from '../../services/dictionary-api.service';

// ─── Synonym form group shape ────────────────────────────────────────────────

function makeSynonymGroup(s?: Partial<Synonym>): FormGroup {
  return new FormGroup({
    word:          new FormControl(s?.word ?? '', [Validators.required]),
    article:       new FormControl<ArticleType | null>(s?.article ?? null),
    translation:   new FormControl(s?.translation ?? '', [Validators.required]),
    example:       new FormControl(s?.example ?? ''),
    exampleNative: new FormControl(s?.exampleNative ?? ''),
  });
}

@Component({
  selector: 'lc-add-word-sheet',
  templateUrl: './add-word-sheet.component.html',
  styleUrls: ['./add-word-sheet.component.scss', './add-word-sheet.fields.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule, TranslatePipe],
})
export class AddWordSheetComponent implements OnInit {
  private readonly vaultStore = inject(VaultV2Store);
  private readonly collectionStore = inject(CollectionStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly authService = inject(AuthService);
  private readonly cardStore = inject(CardStore);
  private readonly cardApi = inject(CardApiService);
  private readonly enrichOneApi = inject(EnrichOneApiService);
  private readonly dictionaryApi = inject(DictionaryApiService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly router = inject(Router);
  private readonly dedupService = inject(CardDedupService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  // @Input() required — Ionic ModalController sets componentProps via Object.assign(),
  // bypassing Angular's setInput() API. input() signals are overwritten with plain values.
  @Input() lockedCollectionId: string | null = null;
  @Input() cardToEdit: Card | null = null;

  get isEditing(): boolean { return !!this.cardToEdit; }

  readonly form = new FormGroup({
    front:         new FormControl('', [Validators.required]),
    back:          new FormControl('', [Validators.required]),
    article:       new FormControl<ArticleType | null>(null),
    plural:        new FormControl(''),
    collectionId:  new FormControl<string | null>(null, [Validators.required]),
    exampleTarget: new FormControl(''),
    exampleNative: new FormControl(''),
    synonyms:      new FormArray<ReturnType<typeof makeSynonymGroup>>([]),
  });

  get synonymsArray(): FormArray { return this.form.get('synonyms') as FormArray; }

  // ─── Form value as signals (reactive with OnPush) ─────────────────────────

  // Same pattern as _article: patchValue with emitEvent:false won't fire valueChanges,
  // so toSignal would stay stale in edit mode. Writable signal seeded in ngOnInit.
  private readonly _collectionId = signal<string | null>(null);

  // article tracks both user taps (emitEvent:true) and auto-detect from back
  // field (emitEvent:false via patchValue). We use a writable signal seeded in
  // ngOnInit so that patchValue with emitEvent:false is reflected immediately.
  private readonly _article = signal<ArticleType | null>(null);

  // back value as signal — drives canAutoGenerate reactively under OnPush
  private readonly _back = toSignal(
    this.form.get('back')!.valueChanges,
    { initialValue: this.form.get('back')!.value },
  );

  // ─── Derived state ─────────────────────────────────────────────────────────

  readonly showPluralField = computed(() => !!this._article());

  readonly selectedCollectionLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const id = this._collectionId();
    if (!id) return this.translate.instant('addWord.collection.noSelectionLabel');
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : this.translate.instant('addWord.collection.noSelectionLabel');
  });

  readonly canAutoGenerate = computed(() =>
    !!this._back()?.trim() && !this.generating(),
  );

  readonly showDuplicateWarning = computed(() =>
    !this.suppressDuplicateWarning() && !!this.duplicateCard(),
  );

  readonly duplicateCollectionName = computed(() => {
    const card = this.duplicateCard();
    if (!card?.collectionId) return null;
    const col = this.collectionStore.collections().find(c => c.id === card.collectionId);
    return col ? `${col.emoji ? col.emoji + ' ' : ''}${col.name}` : null;
  });

  // ─── Local state ───────────────────────────────────────────────────────────

  readonly saving = signal(false);
  readonly generating = signal(false);
  readonly articles: ArticleType[] = ['der', 'die', 'das'];
  readonly duplicateCard = signal<Card | null>(null);
  readonly suppressDuplicateWarning = signal(false);
  readonly expandedSynonymIdx = signal<number | null>(null);
  /** Set when autoGenerate finds a dictionary hit — no AI call was made. */
  readonly fromLibrary = signal<WordDictionaryEntry | null>(null);

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const card = this.cardToEdit;
    if (card) {
      const c = card.content;
      const ex = c.examples?.[0];
      this.form.patchValue({
        front:         c.front,
        back:          c.back,
        article:       c.article ?? null,
        plural:        c.plural ?? '',
        collectionId:  card.collectionId ?? null,
        exampleTarget: ex?.target ?? '',
        exampleNative: ex?.native ?? '',
      }, { emitEvent: false });

      this._article.set(c.article ?? null);
      this._collectionId.set(card.collectionId ?? null);

      this.synonymsArray.clear({ emitEvent: false });
      for (const syn of (c.synonyms ?? [])) {
        this.synonymsArray.push(makeSynonymGroup(syn), { emitEvent: false });
      }
    } else if (this.lockedCollectionId) {
      this.form.patchValue({ collectionId: this.lockedCollectionId });
      this._collectionId.set(this.lockedCollectionId);
    }
  }

  constructor() {
    addIcons({ closeOutline, micOutline, volumeHighOutline, addOutline, sparklesOutline });

    // Single back subscription handles duplicate-check, article auto-detect, and library banner reset.
    this.form.get('back')!.valueChanges.pipe(
      takeUntilDestroyed(),
      distinctUntilChanged(),
    ).subscribe(val => {
      this.fromLibrary.set(null);
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
          this._checkDuplicate();
          return;
        }
      }
      this._checkDuplicate();
    });

    this.form.get('article')!.valueChanges.pipe(
      takeUntilDestroyed(),
    ).subscribe(() => this._checkDuplicate());

    this.form.get('collectionId')!.valueChanges.pipe(
      takeUntilDestroyed(),
    ).subscribe(id => this._collectionId.set(id));
  }

  // ─── Article selection ─────────────────────────────────────────────────────

  selectArticle(art: ArticleType | null): void {
    this.form.patchValue({ article: art, ...(art ? {} : { plural: '' }) });
    this._article.set(art);
  }

  // ─── Auto-generate (LC-137 / LC-WD10) ────────────────────────────────────

  autoGenerate(): void {
    const back = this._back()?.trim();
    if (!back || this.generating()) return;

    this.generating.set(true);
    this.fromLibrary.set(null);

    const article = this.form.get('article')!.value ?? null;

    this.dictionaryApi.lookup(back, article, this.targetLocale(), this.sourceLanguage()).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(({ entry }) => {
        if (entry) {
          return of({ fromDict: entry });
        }
        return this.enrichOneApi.enrich({
          back,
          article: article as 'der' | 'die' | 'das' | null,
          targetLanguage: this.targetLanguage(),
          nativeLanguage: this.sourceLanguage(),
        }).pipe(switchMap(result => of({ fromAI: result })));
      }),
    ).subscribe({
      next: result => {
        if ('fromDict' in result) {
          const entry = result.fromDict;
          this._fillFromEntry(entry);
          this.fromLibrary.set(entry);
        } else {
          const aiResult = result.fromAI;
          const v = this.form.getRawValue();
          this.form.patchValue({
            front:         v.front?.trim() ? v.front : aiResult.front,
            article:       v.article ?? aiResult.article ?? null,
            plural:        aiResult.plural ?? '',
            exampleTarget: v.exampleTarget?.trim() ? v.exampleTarget : aiResult.exampleTarget,
            exampleNative: v.exampleNative?.trim() ? v.exampleNative : aiResult.exampleNative,
          });
          this._article.set(this.form.get('article')!.value);
          this.synonymsArray.clear({ emitEvent: false });
          for (const syn of aiResult.synonyms) {
            this.synonymsArray.push(makeSynonymGroup(syn));
          }
        }
        this.generating.set(false);
      },
      error: async () => {
        this.generating.set(false);
        const toast = await this.toastCtrl.create({
          message: this.translate.instant('addWord.errors.autoGenFailed'),
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  private _fillFromEntry(entry: WordDictionaryEntry): void {
    const example = entry.examples[0] ?? null;
    this.form.patchValue({
      front:         entry.translation,
      article:       entry.article ?? null,
      plural:        entry.plurals[0] ?? '',
      exampleTarget: example?.target ?? '',
      exampleNative: example?.native ?? '',
    });
    this._article.set(entry.article ?? null);
    this.synonymsArray.clear({ emitEvent: false });
    for (const syn of entry.synonyms) {
      this.synonymsArray.push(makeSynonymGroup(syn));
    }
  }

  // ─── Synonym chip editor (LC-136) ─────────────────────────────────────────

  addSynonym(): void {
    this.synonymsArray.push(makeSynonymGroup());
    this.expandedSynonymIdx.set(this.synonymsArray.length - 1);
  }

  removeSynonym(idx: number): void {
    this.synonymsArray.removeAt(idx);
    const current = this.expandedSynonymIdx();
    if (current === idx) this.expandedSynonymIdx.set(null);
    else if (current !== null && current > idx) this.expandedSynonymIdx.update(i => i! - 1);
  }

  toggleSynonymExpand(idx: number): void {
    this.expandedSynonymIdx.set(this.expandedSynonymIdx() === idx ? null : idx);
  }

  getSynonymGroup(idx: number): FormGroup {
    return this.synonymsArray.at(idx) as FormGroup;
  }

  // ─── Duplicate check ───────────────────────────────────────────────────────

  private _checkDuplicate(): void {
    const back = this.form.get('back')!.value?.trim();
    if (!back) { this.duplicateCard.set(null); return; }

    const article = this.form.get('article')!.value ?? null;
    const selfId = this.cardToEdit?.id;

    let found = this.dedupService.check(article, back);
    if (!found || found.id === selfId) {
      found = this.dedupService.checkByBackOnly(back) ?? found;
    }
    this.suppressDuplicateWarning.set(false);
    this.duplicateCard.set(found && found.id !== selfId ? found : null);
  }

  dismissDuplicateWarning(): void { this.suppressDuplicateWarning.set(true); }

  goToExisting(): void {
    const id = this.duplicateCard()?.id;
    if (!id) return;
    this.modalCtrl.dismiss();
    this.router.navigate(['/vault/word', id]);
  }

  // ─── Audio ─────────────────────────────────────────────────────────────────

  playTTS(): void {
    const word = this._back()?.trim();
    if (!word) return;
    const article = this.form.get('article')!.value;
    void this.wordAudio.play(article ? `${article} ${word}` : word, this.targetLocale());
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const examples: ExampleSentence[] = v.exampleTarget?.trim()
      ? [{
          id: this.cardToEdit?.content.examples?.[0]?.id ?? generateUuid(),
          target: v.exampleTarget.trim(),
          native: v.exampleNative?.trim() ?? '',
        }]
      : [];

    const art = v.article ?? null;
    const synonyms: Synonym[] = (v.synonyms ?? [])
      .filter((s: ReturnType<typeof makeSynonymGroup>['value']) => s.word?.trim())
      .map((s: ReturnType<typeof makeSynonymGroup>['value']) => ({
        word:          s.word!.trim(),
        article:       s.article ?? null,
        translation:   s.translation?.trim() ?? '',
        example:       s.example?.trim() ?? '',
        exampleNative: s.exampleNative?.trim() ?? '',
      }));

    const card = this.cardToEdit;
    const dictEntry = this.fromLibrary();
    const content: CardContent = {
      front:            v.front!.trim(),
      back:             v.back!.trim(),
      article:          art,
      gender:           art === 'der' ? 'masculine' : art === 'die' ? 'feminine' : art === 'das' ? 'neuter' : null,
      plural:           (art && v.plural?.trim()) ? v.plural.trim() : null,
      examples,
      synonyms,
      notes:            card?.content.notes ?? '',
      imageUrl:         card?.content.imageUrl ?? null,
      phonetic:         dictEntry?.phonetic ?? card?.content.phonetic ?? null,
      dictionaryWordId: dictEntry?.id ?? card?.content.dictionaryWordId ?? null,
    };

    if (this.isEditing) {
      this.cardApi.update(card!.id, { content, categoryIds: [], collectionId: v.collectionId ?? null } satisfies UpdateCardDto).subscribe({
        next: updated => {
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
      categoryIds: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    }).subscribe({
      next: () => { this.saving.set(false); this.modalCtrl.dismiss({ created: true }); },
      error: () => this.saving.set(false),
    });
  }

  // ─── Navigation / overlay ──────────────────────────────────────────────────

  dismiss(): void { this.modalCtrl.dismiss(); }

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

  private targetLanguage(): string {
    return this.vaultStore.vault()?.learningContext.targetLanguage ?? 'de';
  }

  private sourceLanguage(): string {
    return this.vaultStore.vault()?.learningContext.sourceLanguage ?? 'en';
  }

  private targetLocale(): string {
    const language = this.targetLanguage();
    const locales: Record<string, string> = { de: 'de-DE', en: 'en-US', es: 'es-ES', ar: 'ar-SA' };
    return locales[language] ?? language;
  }
}
