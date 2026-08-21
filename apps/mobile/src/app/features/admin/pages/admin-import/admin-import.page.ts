import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, cloudUploadOutline, eyeOutline, eyeOffOutline, sparklesOutline, trashOutline, volumeHighOutline } from 'ionicons/icons';
import type {
  AdminImportCollectionResult,
  AdminImportCollectionJsonDto,
  AdminImportCollectionJsonResult,
  AdminImportStoryResult,
  AdminPlatformCollectionListItem,
  AdminPlatformStoryListItem,
  CefrLevel,
  GeneratedPlatformStory,
  RawWordInput,
  StoryCategory,
} from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';

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
    topic: new FormControl('', [Validators.required]),
    emoji: new FormControl(''),
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
    topic: new FormControl('', [Validators.required]),
    emoji: new FormControl(''),
    wordsJson: new FormControl('', [Validators.required]),
  });

  readonly promptCopied = signal(false);
  readonly storyPromptCopied = signal(false);

  readonly enrichmentPrompt = `You are a German vocabulary enrichment engine for a language-learning app.

I will give you a list of German words. For each word, return a JSON array where every element follows this exact shape:

{
  "back": "Apfel",              // German word, capitalised correctly (noun = Capital)
  "front": "apple",             // English translation, concise
  "article": "der",             // "der" | "die" | "das" | null (null for verbs/adjectives)
  "plural": "die Äpfel",        // full plural form with article, or null
  "phonetic": "ˈapfəl",        // IPA, or null if unsure
  "cefrLevel": "A1",            // A1 | A2 | B1 | B2 | C1
  "categoryName": "Food",       // one-word topic category in English
  "wordType": "noun",           // noun | verb | adjective | adverb | other
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
2. Every object must have at minimum: back, front, article, wordType.
3. Provide exactly 1 example sentence per word. Keep it natural, not textbook-stilted.
4. Provide 2–3 synonyms where they exist; empty array [] if none.
5. article is null for verbs, adjectives, adverbs.
6. cefrLevel must reflect common usage difficulty, not just word length.
7. categoryName must be a single English word (e.g. Food, Travel, Work, Home, Body, Nature).

WORD LIST:
(paste your words here, one per line — with or without articles)`;

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
  readonly lastCollectionResult = signal<AdminImportCollectionResult | null>(null);
  readonly lastStoryResult = signal<AdminImportStoryResult | null>(null);
  readonly lastJsonResult = signal<AdminImportCollectionJsonResult | null>(null);

  readonly levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly activeTab = signal<'collection' | 'json' | 'story' | 'manage'>('collection');

  readonly collections = signal<AdminPlatformCollectionListItem[]>([]);
  readonly collectionsLoading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly settingCategoryId = signal<string | null>(null);
  readonly deletingCollectionId = signal<string | null>(null);

  readonly stories = signal<AdminPlatformStoryListItem[]>([]);
  readonly storiesLoading = signal(false);
  readonly deletingStoryId = signal<string | null>(null);
  readonly regeneratingAudioId = signal<string | null>(null);
  readonly togglingStoryId = signal<string | null>(null);

  readonly storyCategories = STORY_CATEGORIES;

  constructor() {
    addIcons({ arrowBackOutline, cloudUploadOutline, sparklesOutline, eyeOutline, eyeOffOutline, trashOutline, volumeHighOutline });
  }

  loadCollections(): void {
    if (this.collectionsLoading()) return;
    this.collectionsLoading.set(true);
    this.adminApi.listCollections().pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: items => { this.collections.set(items); this.collectionsLoading.set(false); },
      error: () => { this.collectionsLoading.set(false); void this._toast('Failed to load collections', 'danger'); },
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
          list.map(c => c.id === item.id ? { ...c, storyCategory } : c),
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
        this.collections.update(list => list.map(c => c.id === item.id ? { ...c, isPublished: next } : c));
        void this._toast(`"${item.title}" ${next ? 'published' : 'unpublished'}`, 'success');
      },
      error: () => { this.togglingId.set(null); void this._toast('Toggle failed', 'danger'); },
    });
  }

  loadStories(): void {
    if (this.storiesLoading()) return;
    this.storiesLoading.set(true);
    this.adminApi.listStories().pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: items => { this.stories.set(items); this.storiesLoading.set(false); },
      error: () => { this.storiesLoading.set(false); void this._toast('Failed to load stories', 'danger'); },
    });
  }

  async deleteCollection(item: AdminPlatformCollectionListItem): Promise<void> {
    if (this.deletingCollectionId()) return;
    const alert = await this.alertCtrl.create({
      header: 'Delete collection?',
      message: `Permanently delete "${item.title}" and its ${item.wordCount} word links? Paired stories are kept but detached. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
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
              error: () => { this.deletingCollectionId.set(null); void this._toast('Delete failed', 'danger'); },
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
        { text: 'Cancel', role: 'cancel' },
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
              error: () => { this.deletingStoryId.set(null); void this._toast('Delete failed', 'danger'); },
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
      error: () => { this.regeneratingAudioId.set(null); void this._toast('Audio generation failed', 'danger'); },
    });
  }

  togglePublishStory(item: AdminPlatformStoryListItem): void {
    if (this.togglingStoryId()) return;
    this.togglingStoryId.set(item.id);
    const next = !item.isPublished;
    this.adminApi.setPublishedStory(item.id, next).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.togglingStoryId.set(null);
        this.stories.update(list => list.map(s => s.id === item.id ? { ...s, isPublished: next } : s));
        void this._toast(`"${item.title}" ${next ? 'published' : 'unpublished'}`, 'success');
      },
      error: () => { this.togglingStoryId.set(null); void this._toast('Toggle failed', 'danger'); },
    });
  }

  switchTab(tab: 'collection' | 'json' | 'story' | 'manage'): void {
    this.activeTab.set(tab);
    if (tab === 'manage') {
      if (!this.collections().length) this.loadCollections();
      if (!this.stories().length) this.loadStories();
    }
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
      topic: v.topic!.trim(),
      emoji: v.emoji?.trim() || undefined,
      words,
    }).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
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

    this.adminApi.importStory({ platformCollectionId: v.platformCollectionId!.trim(), story, isFiction: v.isFiction ?? true, generateAudio: v.generateAudio ?? false }).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
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
    let words: AdminImportCollectionJsonDto['words'];
    try {
      words = JSON.parse(v.wordsJson!) as AdminImportCollectionJsonDto['words'];
      if (!Array.isArray(words) || !words.length) throw new Error();
    } catch {
      void this._toast('Invalid JSON. Paste an array of word objects with at least "back" and "front" fields.', 'danger');
      return;
    }

    this.importingJson.set(true);
    this.lastJsonResult.set(null);

    this.adminApi.importCollectionJson({
      title: v.title!.trim(),
      level: v.level!,
      topic: v.topic!.trim() as AdminImportCollectionJsonDto['topic'],
      emoji: v.emoji?.trim() || undefined,
      words,
    }).pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: result => {
        this.importingJson.set(false);
        this.lastJsonResult.set(result);
        void this._toast(`✓ "${result.title}" — ${result.inserted} inserted, ${result.reused} reused, ${result.audioLinked} audio linked`, 'success');
      },
      error: () => {
        this.importingJson.set(false);
        void this._toast('JSON import failed. Check admin permissions and word object shape.', 'danger');
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

  goBack(): void { this.router.navigate(['/home']); }

  private _parseWordList(raw: string): RawWordInput[] {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => !!line && !line.startsWith('#'))
      .map(line => {
        const lower = line.toLowerCase();
        for (const art of ['der ', 'die ', 'das '] as const) {
          if (lower.startsWith(art)) {
            return { back: line.substring(4).trim(), article: art.trim() as 'der' | 'die' | 'das' };
          }
        }
        return { back: line, article: null };
      });
  }

  private async _toast(message: string, color: 'success' | 'danger' | 'warning'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 4000, color, position: 'bottom' });
    await t.present();
  }
}
