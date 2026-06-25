import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  addOutline,
  play,
  playOutline,
  searchOutline,
  sparklesOutline,
  chevronDownCircleOutline,
  chevronForwardOutline,
  cloudOfflineOutline,
  closeOutline,
  ellipsisHorizontal,
} from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { Story, PlatformStoryCard, StoryDifficulty, StoryCategory } from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { SyncService } from '../../../../core/services/sync.service';
import { GenerateStorySheetComponent } from '../../components/generate-story-sheet/generate-story-sheet.component';
import { SubscriptionStore } from '../../../subscription/store/subscription.store';
import { PaywallModalComponent } from '../../../subscription/components/paywall-modal/paywall-modal.component';
import { PlatformStoryApiService } from '../../services/platform-story-api.service';
import { LanguageService } from '../../../../core/services/language.service';
import { LocalDataService } from '../../../../core/services/local-data.service';

const LEVEL_FILTERS: Array<{ value: StoryDifficulty | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
];

@Component({
  selector: 'lc-story-library',
  templateUrl: './story-library.page.html',
  styleUrls: ['./story-library.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonIcon,
    IonRefresher, IonRefresherContent,
    TranslatePipe,
  ],
})
export class StoryLibraryPage implements OnInit {
  private readonly storyStore          = inject(StoryStore);
  private readonly syncService         = inject(SyncService);
  private readonly router              = inject(Router);
  private readonly modalCtrl           = inject(ModalController);
  private readonly alertCtrl           = inject(AlertController);
  private readonly toastCtrl           = inject(ToastController);
  private readonly subscriptionStore   = inject(SubscriptionStore);
  private readonly platformApi         = inject(PlatformStoryApiService);
  private readonly actionSheetCtrl     = inject(ActionSheetController);
  private readonly translate           = inject(TranslateService);
  private readonly languageService     = inject(LanguageService);
  private readonly localData           = inject(LocalDataService);

  // ── My Stories (user-generated) ──────────────────────────────────────────
  readonly stories       = this.storyStore.sortedStories;
  readonly isLoading     = this.storyStore.isLoading;
  readonly isRefreshing  = this.storyStore.isRefreshing;
  readonly isGenerating  = this.storyStore.isGenerating;
  readonly extendingId   = this.storyStore.extendingId;

  // ── Explore (platform stories) ───────────────────────────────────────────
  readonly platformStories     = signal<PlatformStoryCard[]>([]);
  readonly isLoadingExplore    = signal(false);
  readonly exploreError        = signal(false);
  readonly selectedLevel       = signal<StoryDifficulty | null>(null);
  readonly selectedCategory    = signal<StoryCategory | null>(null);

  // ── Inline search ─────────────────────────────────────────────────────────
  readonly searchOpen  = signal(false);
  readonly searchQuery = signal('');

  readonly levelFilters    = LEVEL_FILTERS;
  readonly categoryFilters = STORY_CATEGORIES;

  /** Platform-story ids the user already adopted, derived live from My Stories so
   *  adopting one hides it from Explore immediately (no refetch needed). */
  private readonly adoptedPlatformIds = computed(() => {
    const ids = new Set<string>();
    for (const s of this.stories()) {
      if (s.sourcePlatformStoryId) ids.add(s.sourcePlatformStoryId);
    }
    return ids;
  });

  readonly filteredPlatformStories = computed(() => {
    const level    = this.selectedLevel();
    const category = this.selectedCategory();
    const query    = this.searchQuery().trim().toLowerCase();
    const adopted  = this.adoptedPlatformIds();
    return this.platformStories().filter(s => {
      // Already-added platform stories live under "My Stories" — hide them from Explore.
      if (s.adoptionStatus === 'adopted' || adopted.has(s.id)) return false;
      if (level    && s.level    !== level)    return false;
      if (category && s.category !== category) return false;
      if (query    && !s.title.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  // ── Story Studio 2.0 redesign ────────────────────────────────────────────
  /** Cover gradient pool — mirrors $lc-ss-grad-1..6 design tokens. */
  private static readonly GRADIENTS = [
    'linear-gradient(140deg,#2E5547,#6E9C88)',
    'linear-gradient(140deg,#36544C,#86A99A)',
    'linear-gradient(145deg,#7C4A2E,#C2703D)',
    'linear-gradient(140deg,#22403A,#4E8C76)',
    'linear-gradient(140deg,#566A4E,#9DB08C)',
    'linear-gradient(145deg,#3E4F6B,#7D8FA8)',
  ];

  /** "See all" 2-column grid mode (replaces the Explore rail). */
  readonly seeAll = signal(false);

  /** Continue-reading hero: the story the user most recently engaged with.
   *  Priority: last opened in the reader → last listened → newest. */
  readonly continueStory = computed<Story | null>(() => {
    const all = this.stories();
    if (all.length === 0) return null;

    const opened = this.storyStore.lastOpenedAt();
    const recencyOf = (s: Story): number => {
      const openedAt = opened[s.id] ? new Date(opened[s.id]).getTime() : 0;
      const listenedAt = s.lastListenedAt ? new Date(s.lastListenedAt).getTime() : 0;
      return Math.max(openedAt, listenedAt);
    };

    const engaged = all
      .filter(s => recencyOf(s) > 0)
      .sort((a, b) => recencyOf(b) - recencyOf(a));

    return engaged[0] ?? all[0];
  });

  /** Deterministic cover gradient for a story/platform id. */
  gradientFor(id: string): string {
    const code = id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
    return StoryLibraryPage.GRADIENTS[code % StoryLibraryPage.GRADIENTS.length];
  }

  /** Serif initial letter for a My-Stories tile. */
  initialFor(story: Story): string {
    return (story.title.trim()[0] ?? '•').toUpperCase();
  }

  /** Honest reading status for the continue hero.
   *  We don't persist a per-story read position, so we only surface states we can
   *  actually back with data: 'done' (marked learned), 'in-progress' (listened at
   *  least once) or 'new'. No fabricated percentage. */
  heroStatus(story: Story | null): 'done' | 'in-progress' | 'new' {
    if (!story) return 'new';
    if (story.isLearned) return 'done';
    if (story.lastListenedAt || story.listenCount > 0) return 'in-progress';
    return 'new';
  }

  /** Translated label shown next to the hero progress bar. */
  heroStatusLabel(story: Story | null): string {
    const keyMap: Record<ReturnType<StoryLibraryPage['heroStatus']>, string> = {
      'done': 'stories.library.progressDone',
      'in-progress': 'stories.library.progressInProgress',
      'new': 'stories.library.progressNew',
    };
    return this.translate.instant(keyMap[this.heroStatus(story)]);
  }

  toggleSeeAll(): void {
    this.seeAll.update(v => !v);
  }

  constructor() {
    addIcons({
      bookOutline, addOutline, play, playOutline, searchOutline, sparklesOutline,
      chevronDownCircleOutline, chevronForwardOutline, cloudOfflineOutline, closeOutline,
      ellipsisHorizontal,
    });

    effect(async () => {
      const err = this.storyStore.extendError();
      if (err) {
        const toast = await this.toastCtrl.create({
          message: this.translate.instant('stories.library.extensionFailedToast'),
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      }
    });
  }

  ngOnInit(): void {
    this.storyStore.loadStories();
    this.loadPlatformStories();
  }

  // ── Explore actions ───────────────────────────────────────────────────────

  selectLevel(level: StoryDifficulty | null): void {
    this.selectedLevel.set(this.selectedLevel() === level ? null : level);
  }

  selectCategory(category: StoryCategory | null): void {
    if (category === null) {
      this.selectedCategory.set(null);
      return;
    }
    this.selectedCategory.set(this.selectedCategory() === category ? null : category);
  }

  /** Read minutes for the continue-reading hero (My-Stories use audio duration). */
  continueMins(story: Story): number {
    return Math.max(1, Math.ceil(story.audioDurationMs / 60000));
  }

  /** Best-effort category label for a generated story (uses source collection
   *  topics when available, else a generic label). */
  heroCategoryLabel(story: Story): string {
    const cat = STORY_CATEGORIES.find(c => story.sourceCollectionIds?.includes(c.value));
    return cat?.label ?? this.translate.instant('stories.length.' + story.lengthType);
  }

  navigateToPlatformStory(id: string): void {
    this.router.navigate(['/stories/platform', id]);
  }

  toggleSearch(): void {
    const next = !this.searchOpen();
    this.searchOpen.set(next);
    if (!next) {
      this.searchQuery.set('');
    }
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value ?? '');
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  // ── My Stories actions ────────────────────────────────────────────────────

  async onRefresh(event: Event): Promise<void> {
    if (!navigator.onLine) {
      setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
      return;
    }
    await this.syncService.forceSync();
    this.loadPlatformStories();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async openGenerateSheet(): Promise<void> {
    if (!this.subscriptionStore.canGenerateStory()) {
      const paywall = await this.modalCtrl.create({
        component: PaywallModalComponent,
        breakpoints: [0, 1],
        initialBreakpoint: 1,
      });
      await paywall.present();
      return;
    }

    const modal = await this.modalCtrl.create({
      component: GenerateStorySheetComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handle: true,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ story: Story; generated?: boolean }>();
    if (data?.generated) {
      this.subscriptionStore.onStoryGenerated();
    }
    if (data?.story) {
      this.router.navigate(['/stories', data.story.id]);
    }
  }

  openStory(event: Event | null, story: Story): void {
    event?.stopPropagation();
    this.router.navigate(['/stories', story.id]);
  }

  listenStory(event: Event, story: Story): void {
    event.stopPropagation();
    this.router.navigate(['/stories', story.id], { queryParams: { autoPlay: '1' } });
  }

  onExtend(event: Event, id: string): void {
    event.stopPropagation();
    this.storyStore.extendStory(id);
  }

  async openMoreSheet(event: Event, story: Story): Promise<void> {
    event.stopPropagation();
    // Adopted platform stories are "removed from my stories" (the platform copy is
    // untouched); user-generated stories are "deleted" outright. Both just drop the
    // user's own Story row, but the wording differs so the action reads correctly.
    const adopted = !!story.sourcePlatformStoryId;
    const sheet = await this.actionSheetCtrl.create({
      buttons: [
        {
          text: this.translate.instant(
            adopted ? 'stories.library.removeAction' : 'stories.library.deleteAction',
          ),
          role: 'destructive',
          handler: () => this.confirmDelete(story),
        },
        { text: this.translate.instant('stories.library.cancelAction'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmDelete(story: Story): Promise<void> {
    const adopted = !!story.sourcePlatformStoryId;
    const alert = await this.alertCtrl.create({
      header: this.translate.instant(
        adopted ? 'stories.library.removeAlertHeader' : 'stories.library.deleteAlertHeader',
      ),
      message: this.translate.instant(
        adopted ? 'stories.library.removeAlertMsg' : 'stories.library.deleteAlertMsg',
        { title: story.title },
      ),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant(
            adopted ? 'stories.library.removeActionBtn' : 'stories.library.deleteActionBtn',
          ),
          role: 'destructive',
          handler: () => this.storyStore.deleteStory(story.id),
        },
      ],
    });
    await alert.present();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  readingTime(story: Story): string {
    const mins = Math.max(1, Math.ceil(story.audioDurationMs / 60000));
    return `${mins} ${this.translate.instant('stories.cardMeta.min')}`;
  }

  translateLength(lengthType: string): string {
    const keyMap: Record<string, string> = {
      'short': 'stories.length.short', 'medium': 'stories.length.medium',
      'long': 'stories.length.long', 'very-long': 'stories.length.veryLong',
      'extra-long': 'stories.length.extraLong',
    };
    return this.translate.instant(keyMap[lengthType] ?? lengthType);
  }

  storyWordCount(story: Story): number {
    return story.sentences.reduce((acc, s) => acc + s.german.split(/\s+/).length, 0);
  }

  thumbEmoji(story: Story): string {
    const emojis = ['📖', '🎓', '🌍', '✈️', '🍽️', '💼', '🎵', '🏔️', '🎭', '🔬'];
    // Deterministic per story — simple char-code sum mod pool length
    const code = story.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
    return emojis[code % emojis.length];
  }

  platformReadingTime(story: PlatformStoryCard): string {
    return `${story.estimatedReadMinutes} min`;
  }

  categoryLabel(value: StoryCategory): string {
    return STORY_CATEGORIES.find(c => c.value === value)?.label ?? value;
  }

  categoryIcon(value: StoryCategory): string {
    return STORY_CATEGORIES.find(c => c.value === value)?.icon ?? '📖';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private loadPlatformStories(): void {
    const nativeLang = this.languageService.current();
    this.exploreError.set(false);

    // 1. Cache-first — render the Explore catalogue instantly and keep it
    //    available offline. Only show the loading skeleton when nothing is cached.
    void this.localData.getPlatformStoriesList(nativeLang).then(cached => {
      if (cached.length > 0 && this.platformStories().length === 0) {
        this.platformStories.set(cached);
      } else if (cached.length === 0) {
        this.isLoadingExplore.set(true);
      }
    });

    // 2. Background network refresh — persist on success, keep the cache on failure.
    this.platformApi.getAll({ limit: 20, nativeLang }).subscribe({
      next: res => {
        this.platformStories.set(res.stories);
        this.isLoadingExplore.set(false);
        void this.localData.setPlatformStoriesList(nativeLang, res.stories);
      },
      error: () => {
        this.isLoadingExplore.set(false);
        // Only surface an error when there's nothing cached to fall back on.
        if (this.platformStories().length === 0) this.exploreError.set(true);
      },
    });
  }
}
