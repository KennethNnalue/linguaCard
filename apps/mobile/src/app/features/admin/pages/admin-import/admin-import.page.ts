import {AppNotificationService} from '@lingua-card/mobile/notifications';
import {ChangeDetectionStrategy, Component, DestroyRef, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {Router} from '@angular/router';
import {AlertController, IonContent, IonHeader, IonIcon, IonToolbar} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  arrowBackOutline,
  cloudUploadOutline,
  eyeOffOutline,
  eyeOutline,
  sparklesOutline,
  trashOutline,
  volumeHighOutline
} from 'ionicons/icons';
import type {
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportCollectionResult,
  AdminImportStoryResult,
  AdminPlatformCollectionListItem,
  AdminPlatformCollectionWordItem,
  AdminPlatformStoryListItem,
  CefrLevel,
  GeneratedPlatformStory,
  RawWordInput,
  StoryCategory,
} from '@lingua-card/shared/domain';
import {STORY_CATEGORIES} from '@lingua-card/shared/domain';
import {TranslatePipe} from '@ngx-translate/core';
import {catchError, concatMap, map, Observable, of} from 'rxjs';
import {AdminApiService} from '../../services/admin-api.service';

@Component({
  selector: 'lc-admin-import',
  templateUrl: './admin-import.page.html',
  styleUrls: ['./admin-import.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule, TranslatePipe],
})
export class AdminImportPage {
  private readonly adminApi = inject(AdminApiService);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  readonly collectionForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    level: new FormControl<CefrLevel>('A1', [Validators.required]),
    wordListRaw: new FormControl('', [Validators.required]),
  });

  readonly storyForm = new FormGroup({
    platformCollectionId: new FormControl('', [Validators.required]),
    storyJson: new FormControl('', [Validators.required]),
    isFiction: new FormControl(true),
    generateAudio: new FormControl(false),
  });

  readonly jsonForm = new FormGroup({
    title: new FormControl('', [Validators.required]),
    level: new FormControl<CefrLevel>('A1', [Validators.required]),
    wordsJson: new FormControl('', [Validators.required]),
  });

  readonly promptCopied = signal(false);
  readonly storyPromptCopied = signal(false);

  readonly enrichmentPrompt
    = `You are a German vocabulary enrichment engine for a language-learning app.

I will give you a list of German words. For each word, return a JSON array where every element follows this exact shape:

{
  "back": "Apfel",
  "front": "apple",
  "article": "der",
  "plural": "Äpfel",
  "cefrLevel": "A1",
  "wordType": "noun",
  "examples": [
    {
      "target": "Der Apfel ist rot.",
      "native": "The apple is red."
    }
  ],
  "synonyms": [
    {
      "word": "Frucht",
      "article": "die",
      "translation": "fruit",
      "example": "Die Frucht hängt am Baum.",
      "exampleNative": "The fruit hangs on the tree."
    }
  ]
}

RULES

1. Output ONLY a valid JSON array — no markdown, no commentary, no code fences.

2. Every object must contain:
   "back", "front", "article", "plural", "cefrLevel", "wordType", "examples", and "synonyms".

3. "back" must contain the correctly written German word.
   - Capitalise German nouns correctly.
   - Use the infinitive form for verbs unless the supplied word clearly requires another form.

4. "front" must be a concise and accurate English translation.

5. "article" must be:
   - "der", "die", or "das" for nouns.
   - null for verbs, adjectives, adverbs, and other words that do not take an article.

6. "plural" must contain ONLY the plural word, without an article.
   - Example: "Äpfel", not "die Äpfel".
   - Use null when no plural is applicable.

7. "cefrLevel" must be one of:
   "A1", "A2", "B1", "B2", "C1".
   Base the level on common usage difficulty and when the word is typically useful to a German learner.

8. "wordType" must be one of:
   "noun", "verb", "adjective", "adverb", "other".

9. Provide exactly 1 example sentence per word.
   - The sentence must be natural and idiomatic German.
   - It should clearly demonstrate the meaning of the word.
   - Avoid unnatural or overly textbook-like sentences.
   - "target" contains the German sentence.
   - "native" contains the natural English translation.

10. Every word MUST have at least 1 synonym or closely related usable equivalent.
    - "synonyms" must NEVER be an empty array.
    - Prefer 2–3 synonyms when good equivalents exist.
    - If there is no exact synonym, provide the closest natural German equivalent or closely related word that helps a learner understand or remember the meaning.
    - Never invent a nonexistent or misleading synonym just to satisfy this rule.

11. Every synonym object must contain:
    - "word": German synonym or closest equivalent.
    - "article": "der", "die", or "das" if the synonym is a noun; otherwise null.
    - "translation": concise English meaning.
    - "example": one natural German sentence using the synonym.
    - "exampleNative": natural English translation of that sentence.

12. Preserve the semantic meaning of the original word.
    If a German word has multiple meanings, use the most common everyday meaning unless the supplied context clearly indicates another meaning.

13. Do not add fields that are not part of the defined JSON structure.

WORD LIST:
(paste your German words here, one per line — with or without articles)`;

  readonly storyPrompt = `ROLE: You are a German-language curriculum writer producing a CANONICAL platform story for a vocabulary app. This story will be shown to MANY learners, so it must be correct, natural, and tightly scoped to the supplied word list.

TARGET CEFR LEVEL: {{LEVEL}}            // one of A1, A2, B1, B2, C1
TOPIC: {{TOPIC}}                         // e.g. "Food & Drink"
NATIVE LANGUAGE: {{NATIVE_LANGUAGE}}     // language of all translations, e.g. "English", "Spanish", "Arabic"
NATIVE LANGUAGE CODE: {{NATIVE_LANG_CODE}} // ISO code, e.g. "en", "es", "ar"
WORD LIST (use these exact words; do not invent vocabulary beyond what this level needs):
{{WORD_LIST}}                            // newline list: "der Apfel = apple", "bestellen = to order", ...

HARD RULES
1. Use AT LEAST 80% of the WORD LIST. Every listed word that appears must be in a NATURAL, everyday context — never a dictionary-style filler sentence.
2. Stay strictly at CEFR {{LEVEL}}. For A1/A2: short main clauses, present and simple past, no subjunctive, no passive. Higher levels may add subordinate clauses/tenses as the level allows.
3. Words must appear in CORRECT grammatical form — right article, case, and conjugation.
4. Write a COMPLETE arc (beginning → middle → end) of 8–16 sentences for short, 16–28 for medium. Include natural dialogue where it fits.
5. Provide a {{NATIVE_LANGUAGE}} translation (the "native" field) for every sentence, the title, every keyword, and every grammar note. The German ("german") text is never translated away — only the "native"/"translation" fields are in {{NATIVE_LANGUAGE}}.
6. Do NOT add words to hit a quota — only natural usage counts toward the 80%.
7. Write 4–6 quiz questions (fill-in-the-blank from the story) and 1–3 grammar notes that fit the level.

OUTPUT — valid JSON ONLY, no markdown fences, no commentary:
{
  "title": "German title",
  "titleTranslation": "Title in {{NATIVE_LANGUAGE}}",
  "level": "{{LEVEL}}",
  "topic": "{{TOPIC}}",
  "nativeLang": "{{NATIVE_LANG_CODE}}",
  "sentences": [
    { "german": "...", "native": "... ({{NATIVE_LANGUAGE}})", "wordsUsed": ["Apfel", "bestellen"] }
  ],
  "keywords": [
    { "germanBase": "Apfel", "article": "der", "translation": "apple ({{NATIVE_LANGUAGE}})", "wordType": "noun", "level": "A1" }
  ],
  "quizQuestions": [
    { "sentenceTemplate": "Im Café bestellt Lena ___ Apfelsaft.", "correctAnswer": "einen", "distractors": ["ein", "eine"], "audioSentence": "Im Café bestellt Lena einen Apfelsaft.", "hint": "Akkusativ, masculine" }
  ],
  "grammarNotes": [
    { "title": "Accusative article", "exampleDe": "...", "exampleNative": "... ({{NATIVE_LANGUAGE}})", "description": "Explain in {{NATIVE_LANGUAGE}}.", "conjugationTable": [{ "pronoun": "der", "form": "den" }], "additionalExamples": [{ "de": "...", "native": "... ({{NATIVE_LANGUAGE}})" }] }
  ]
}`;

  readonly importing = signal(false);
  readonly importingStory = signal(false);
  readonly importingJson = signal(false);
  readonly jsonImportStage = signal<'idle' | 'validating' | 'vocabulary' | 'thumbnail' | 'complete' | 'failed'>('idle');
  readonly jsonImportError = signal<string | null>(null);
  readonly jsonImportWarning = signal<string | null>(null);
  readonly lastCollectionResult = signal<AdminImportCollectionResult | null>(null);
  readonly lastStoryResult = signal<AdminImportStoryResult | null>(null);
  readonly lastJsonResult = signal<AdminImportCollectionJsonResult | null>(null);

  readonly levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly activeTab = signal<'upload' | 'story' | 'collections' | 'stories'>('upload');
  readonly importMode = signal<'words' | 'json'>('words');
  readonly collectionImage = signal<File | null>(null);
  readonly collectionImagePreview = signal<string | null>(null);

  readonly collections = signal<AdminPlatformCollectionListItem[]>([]);
  readonly collectionsLoading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly settingCategoryId = signal<string | null>(null);
  readonly deletingCollectionId = signal<string | null>(null);
  readonly editingCollectionId = signal<string | null>(null);
  readonly collectionWords = signal<AdminPlatformCollectionWordItem[]>([]);
  readonly collectionWordsLoading = signal(false);
  readonly mutatingCollectionWord = signal(false);

  readonly stories = signal<AdminPlatformStoryListItem[]>([]);
  readonly storiesLoading = signal(false);
  readonly deletingStoryId = signal<string | null>(null);
  readonly regeneratingAudioId = signal<string | null>(null);
  readonly togglingStoryId = signal<string | null>(null);

  readonly storyCategories = STORY_CATEGORIES;

  constructor() {
    addIcons({
      arrowBackOutline,
      cloudUploadOutline,
      sparklesOutline,
      eyeOutline,
      eyeOffOutline,
      trashOutline,
      volumeHighOutline
    });
  }

  loadCollections(): void {
    if (this.collectionsLoading()) return;
    this.collectionsLoading.set(true);
    this.adminApi.listCollections().pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: items => {
        this.collections.set(items);
        this.collectionsLoading.set(false);
      },
      error: () => {
        this.collectionsLoading.set(false);
        void this._toast('Failed to load collections', 'danger');
      },
    });
  }

  setStoryCategory(item: AdminPlatformCollectionListItem, value: string): void {
    if (this.settingCategoryId()) return;
    const storyCategory: StoryCategory | null = value === '' ? null : (value as StoryCategory);
    this.settingCategoryId.set(item.id);
    this.adminApi.setStoryCategory(item.id, storyCategory).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.settingCategoryId.set(null);
        this.collections.update(list =>
          list.map(c => c.id === item.id ? {...c, storyCategory} : c),
        );
      },
      error: () => {
        this.settingCategoryId.set(null);
        void this._toast('Failed to update story category', 'danger');
      },
    });
  }

  togglePublish(item: AdminPlatformCollectionListItem): void {
    if (this.togglingId()) return;
    this.togglingId.set(item.id);
    const next = !item.isPublished;
    this.adminApi.setPublished(item.id, next).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.collections.update(list => list.map(c => c.id === item.id ? {...c, isPublished: next} : c));
        void this._toast(`"${item.title}" ${next ? 'published' : 'unpublished'}`, 'success');
      },
      error: error => {
        this.togglingId.set(null);
        void this._toast(this.apiErrorMessage(error, 'Publishing failed'), 'danger');
      },
    });
  }

  toggleCollectionEditor(item: AdminPlatformCollectionListItem): void {
    if (this.editingCollectionId() === item.id) {
      this.editingCollectionId.set(null);
      this.collectionWords.set([]);
      return;
    }
    this.editingCollectionId.set(item.id);
    this.collectionWords.set([]);
    this.collectionWordsLoading.set(true);
    this.adminApi.listCollectionWords(item.id).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: words => {
        this.collectionWords.set(words);
        this.collectionWordsLoading.set(false);
      },
      error: () => {
        this.collectionWordsLoading.set(false);
        void this._toast('Failed to load collection words', 'danger');
      },
    });
  }

  moveCollectionWord(collection: AdminPlatformCollectionListItem, index: number, direction: -1 | 1): void {
    if (collection.isPublished || this.mutatingCollectionWord()) return;
    const destination = index + direction;
    const current = this.collectionWords();
    if (destination < 0 || destination >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    this.mutatingCollectionWord.set(true);
    this.adminApi.reorderCollectionWords(collection.id, reordered.map(word => word.id))
      .pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.collectionWords.set(reordered.map((word, position) => ({...word, position})));
        this.mutatingCollectionWord.set(false);
      },
      error: () => {
        this.mutatingCollectionWord.set(false);
        void this._toast('Could not reorder words', 'danger');
      },
    });
  }

  removeCollectionWord(collection: AdminPlatformCollectionListItem, word: AdminPlatformCollectionWordItem): void {
    if (collection.isPublished || this.mutatingCollectionWord()) return;
    this.mutatingCollectionWord.set(true);
    this.adminApi.removeCollectionWord(collection.id, word.id).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.collectionWords.update(words => words.filter(item => item.id !== word.id).map((item, position) => ({
          ...item,
          position
        })));
        this.collections.update(items => items.map(item => item.id === collection.id
          ? {
            ...item,
            wordCount: Math.max(0, item.wordCount - 1),
            dictionaryLinked: Math.max(0, item.dictionaryLinked - 1),
            status: 'draft'
          }
          : item));
        this.mutatingCollectionWord.set(false);
      },
      error: () => {
        this.mutatingCollectionWord.set(false);
        void this._toast('Could not remove word', 'danger');
      },
    });
  }

  loadStories(): void {
    if (this.storiesLoading()) return;
    this.storiesLoading.set(true);
    this.adminApi.listStories().pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: items => {
        this.stories.set(items);
        this.storiesLoading.set(false);
      },
      error: () => {
        this.storiesLoading.set(false);
        void this._toast('Failed to load stories', 'danger');
      },
    });
  }

  async deleteCollection(item: AdminPlatformCollectionListItem): Promise<void> {
    if (this.deletingCollectionId()) return;
    const alert = await this.alertCtrl.create({
      header: 'Delete collection?',
      message: `Permanently delete "${item.title}" and its ${item.wordCount} word links? Paired stories are kept but detached. This cannot be undone.`,
      buttons: [
        {text: 'Cancel', role: 'cancel'},
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.deletingCollectionId.set(item.id);
            this.adminApi.deleteCollection(item.id).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
              next: () => {
                this.deletingCollectionId.set(null);
                this.collections.update(list => list.filter(c => c.id !== item.id));
                void this._toast(`"${item.title}" deleted`, 'success');
              },
              error: () => {
                this.deletingCollectionId.set(null);
                void this._toast('Delete failed', 'danger');
              },
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteStory(item: AdminPlatformStoryListItem): Promise<void> {
    if (this.deletingStoryId()) return;
    const alert = await this.alertCtrl.create({
      header: 'Delete story?',
      message: `Permanently delete "${item.title}" and all reader progress for it? This cannot be undone.`,
      buttons: [
        {text: 'Cancel', role: 'cancel'},
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.deletingStoryId.set(item.id);
            this.adminApi.deleteStory(item.id).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
              next: () => {
                this.deletingStoryId.set(null);
                this.stories.update(list => list.filter(s => s.id !== item.id));
                void this._toast(`"${item.title}" deleted`, 'success');
              },
              error: () => {
                this.deletingStoryId.set(null);
                void this._toast('Delete failed', 'danger');
              },
            });
          },
        },
      ],
    });
    await alert.present();
  }

  regenerateStoryAudio(item: AdminPlatformStoryListItem): void {
    if (this.regeneratingAudioId()) return;
    this.regeneratingAudioId.set(item.id);
    this.adminApi.regenerateStoryAudio(item.id).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: result => {
        this.regeneratingAudioId.set(null);
        void this._toast(
          result.audioGenerated
            ? `✓ Audio generated for "${result.title}"`
            : `Audio generation failed for "${result.title}" — try again`,
          result.audioGenerated ? 'success' : 'warning',
        );
      },
      error: () => {
        this.regeneratingAudioId.set(null);
        void this._toast('Audio generation failed', 'danger');
      },
    });
  }

  togglePublishStory(item: AdminPlatformStoryListItem): void {
    if (this.togglingStoryId()) return;
    this.togglingStoryId.set(item.id);
    const next = !item.isPublished;
    this.adminApi.setPublishedStory(item.id, next).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.togglingStoryId.set(null);
        this.stories.update(list => list.map(s => s.id === item.id ? {...s, isPublished: next} : s));
        void this._toast(`"${item.title}" ${next ? 'published' : 'unpublished'}`, 'success');
      },
      error: () => {
        this.togglingStoryId.set(null);
        void this._toast('Toggle failed', 'danger');
      },
    });
  }

  switchTab(tab: 'upload' | 'story' | 'collections' | 'stories'): void {
    this.activeTab.set(tab);
    if (tab === 'collections' && !this.collections().length) this.loadCollections();
    if (tab === 'stories' && !this.stories().length) this.loadStories();
  }

  selectImportMode(mode: 'words' | 'json'): void {
    this.importMode.set(mode);
  }

  selectCollectionImage(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0] ?? null;
    this.collectionImage.set(file);
    if (!file) {
      this.collectionImagePreview.set(null);
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      this.collectionImagePreview.set(typeof reader.result === 'string' ? reader.result : null);
    }, {once: true});
    reader.readAsDataURL(file);
  }

  async selectJsonFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.jsonForm.controls.wordsJson.setValue(await input.files[0].text());
  }

  importCollection(): void {
    this.collectionForm.markAllAsTouched();
    if (this.collectionForm.invalid || this.importing()) return;

    const v = this.collectionForm.getRawValue();
    const words = this._parseWordList(v.wordListRaw ?? '');
    if (!words.length) {
      void this._toast('Word list is empty. Use one word per line: "der Apfel" or "bestellen"', 'warning');
      return;
    }

    this.importing.set(true);
    this.lastCollectionResult.set(null);

    this.adminApi.importCollection({
      title: v.title!.trim(),
      level: v.level!,
      words,
    }).pipe(
      concatMap(result => this.uploadCoverAfterImport(result.collectionId).pipe(map(() => result))),
      takeUntilDestroyed(this._destroyRef),
    ).subscribe({
      next: result => {
        this.importing.set(false);
        this.lastCollectionResult.set(result);
        void this._toast(`✓ Collection "${result.title}" created — ${result.reused} reused, ${result.enriched} enriched`, 'success');
      },
      error: () => {
        this.importing.set(false);
        void this._toast('Import failed. Check admin permissions and try again.', 'danger');
      },
    });
  }

  importStory(): void {
    this.storyForm.markAllAsTouched();
    if (this.storyForm.invalid || this.importingStory()) return;

    const v = this.storyForm.getRawValue();
    let story: GeneratedPlatformStory;
    try {
      story = JSON.parse(v.storyJson!) as GeneratedPlatformStory;
    } catch {
      void this._toast('Invalid JSON. Paste the raw JSON output from the AI prompt.', 'danger');
      return;
    }

    this.importingStory.set(true);
    this.lastStoryResult.set(null);

    this.adminApi.importStory({
      platformCollectionId: v.platformCollectionId!.trim(),
      story,
      isFiction: v.isFiction ?? true,
      generateAudio: v.generateAudio ?? false
    }).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: result => {
        this.importingStory.set(false);
        this.lastStoryResult.set(result);
        const audioNote = v.generateAudio ? (result.audioGenerated ? ', audio ✓' : ', audio failed') : '';
        void this._toast(`✓ Story "${result.title}" saved (${result.sentenceCount} sentences, ${result.keywordsResolved} keywords resolved${audioNote})`, 'success');
      },
      error: () => {
        this.importingStory.set(false);
        void this._toast('Story import failed. Check JSON shape and admin permissions.', 'danger');
      },
    });
  }

  importJson(): void {
    this.jsonForm.markAllAsTouched();
    if (this.jsonForm.invalid || this.importingJson()) return;

    const v = this.jsonForm.getRawValue();
    this.jsonImportStage.set('validating');
    this.jsonImportError.set(null);
    this.jsonImportWarning.set(null);
    let words: AdminImportCollectionJsonDto['words'];
    try {
      words = this.parseEnrichedWords(v.wordsJson ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      this.jsonImportStage.set('failed');
      this.jsonImportError.set(message);
      void this._toast(message, 'danger');
      return;
    }

    this.importingJson.set(true);
    this.jsonImportStage.set('vocabulary');
    this.lastJsonResult.set(null);

    this.adminApi.importCollectionJson({
      title: v.title!.trim(),
      level: v.level!,
      words,
    }).pipe(
      concatMap(result => {
        this.jsonImportStage.set(this.collectionImage() ? 'thumbnail' : 'complete');
        return this.uploadCoverAfterImport(result.collectionId).pipe(map(() => result));
      }),
      takeUntilDestroyed(this._destroyRef),
    ).subscribe({
      next: result => {
        this.importingJson.set(false);
        this.jsonImportStage.set('complete');
        this.lastJsonResult.set(result);
        void this._toast(`✓ "${result.title}" — ${result.inserted} inserted, ${result.reused} reused, ${result.audioLinked} audio linked`, 'success');
      },
      error: error => {
        this.importingJson.set(false);
        this.jsonImportStage.set('failed');
        const message = this.apiErrorMessage(error, 'JSON import failed');
        this.jsonImportError.set(message);
        void this._toast(message, 'danger');
      },
    });
  }

  async copyPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.enrichmentPrompt);
    this.promptCopied.set(true);
    setTimeout(() => this.promptCopied.set(false), 2500);
  }

  async copyStoryPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.storyPrompt);
    this.storyPromptCopied.set(true);
    setTimeout(() => this.storyPromptCopied.set(false), 2500);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  private _parseWordList(raw: string): RawWordInput[] {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => !!line && !line.startsWith('#'))
      .map(line => {
        const lower = line.toLowerCase();
        for (const art of ['der ', 'die ', 'das '] as const) {
          if (lower.startsWith(art)) {
            return {back: line.substring(4).trim(), article: art.trim() as 'der' | 'die' | 'das'};
          }
        }
        return {back: line, article: null};
      });
  }

  private async _toast(message: string, color: 'success' | 'danger' | 'warning'): Promise<void> {
    const t = await this.toastCtrl.create({message, duration: 4000, color, position: 'bottom'});
    await t.present();
  }

  private uploadCoverAfterImport(collectionId: string): Observable<unknown> {
    const image = this.collectionImage();
    if (!image) return of(null);
    return this.adminApi.uploadCollectionCover(collectionId, image).pipe(
      catchError(() => {
        const message = 'Collection created, but the thumbnail upload failed. You can still review and publish it.';
        this.jsonImportWarning.set(message);
        void this._toast(message, 'warning');
        return of(null);
      }),
    );
  }

  private parseEnrichedWords(raw: string): AdminImportCollectionJsonDto['words'] {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('JSON must be a non-empty array of word objects.');
    }
    for (let index = 0; index < value.length; index += 1) {
      const word = value[index];
      if (!this.isRecord(word)) throw new Error(`Word ${index + 1} must be an object.`);
      if (typeof word['back'] !== 'string' || !word['back'].trim()) {
        throw new Error(`Word ${index + 1} is missing a valid "back" value.`);
      }
      if (typeof word['front'] !== 'string' || !word['front'].trim()) {
        throw new Error(`Word ${index + 1} is missing a valid "front" value.`);
      }
      const article = word['article'];
      if (article !== null && article !== 'der' && article !== 'die' && article !== 'das') {
        throw new Error(`Word ${index + 1} has an invalid "article" value.`);
      }
      if (word['plural'] !== null && typeof word['plural'] !== 'string') {
        throw new Error(`Word ${index + 1} has an invalid "plural" value.`);
      }
      if (!this.isCefrLevel(word['cefrLevel'])) {
        throw new Error(`Word ${index + 1} has an invalid "cefrLevel" value.`);
      }
      if (!this.isWordType(word['wordType'])) {
        throw new Error(`Word ${index + 1} has an invalid "wordType" value.`);
      }
    }
    return value.map((word, index) => ({
      back: String(word['back']).trim(),
      front: String(word['front']).trim(),
      article: word['article'] === 'der' || word['article'] === 'die' || word['article'] === 'das' ? word['article'] : null,
      plural: typeof word['plural'] === 'string' ? word['plural'] : null,
      phonetic: typeof word['phonetic'] === 'string' ? word['phonetic'] : null,
      cefrLevel: this.isCefrLevel(word['cefrLevel']) ? word['cefrLevel'] : null,
      categoryName: typeof word['categoryName'] === 'string' ? word['categoryName'] : undefined,
      examples: this.parseExamples(word['examples'], index),
      synonyms: this.parseSynonyms(word['synonyms'], index),
      wordType: this.isWordType(word['wordType']) ? word['wordType'] : 'other',
    }));
  }

  private parseExamples(value: unknown, wordIndex: number): Array<{ target: string; native: string }> {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new Error(`Word ${wordIndex + 1} must contain exactly one example.`);
    }
    return value.map(example => {
      if (!this.isRecord(example) || typeof example['target'] !== 'string' || typeof example['native'] !== 'string') {
        throw new Error(`Word ${wordIndex + 1} contains an invalid example.`);
      }
      return {target: example['target'], native: example['native']};
    });
  }

  private parseSynonyms(value: unknown, wordIndex: number): AdminImportCollectionJsonDto['words'][number]['synonyms'] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`Word ${wordIndex + 1} must contain at least one synonym.`);
    }
    return value.map(synonym => {
      if (!this.isRecord(synonym) || typeof synonym['word'] !== 'string' || typeof synonym['translation'] !== 'string') {
        throw new Error(`Word ${wordIndex + 1} contains an invalid synonym.`);
      }
      const article = synonym['article'];
      if (article !== null && article !== undefined && article !== 'der' && article !== 'die' && article !== 'das') {
        throw new Error(`Word ${wordIndex + 1} contains a synonym with an invalid article.`);
      }
      if (typeof synonym['example'] !== 'string' || !synonym['example'].trim()
        || typeof synonym['exampleNative'] !== 'string' || !synonym['exampleNative'].trim()) {
        throw new Error(`Word ${wordIndex + 1} contains a synonym without valid example translations.`);
      }
      return {
        word: synonym['word'],
        article: synonym['article'] === 'der' || synonym['article'] === 'die' || synonym['article'] === 'das'
          ? synonym['article'] : null,
        translation: synonym['translation'],
        example: typeof synonym['example'] === 'string' ? synonym['example'] : undefined,
        exampleNative: typeof synonym['exampleNative'] === 'string' ? synonym['exampleNative'] : undefined,
      };
    });
  }

  private isCefrLevel(value: unknown): value is CefrLevel {
    return value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1';
  }

  private isWordType(value: unknown): value is 'noun' | 'verb' | 'adjective' | 'adverb' | 'other' {
    return value === 'noun' || value === 'verb' || value === 'adjective' || value === 'adverb' || value === 'other';
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    const response = error.error;
    if (this.isRecord(response)) {
      const message = response['message'];
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message) && message.every(item => typeof item === 'string')) return message.join(' ');
    }
    return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
  }
}
