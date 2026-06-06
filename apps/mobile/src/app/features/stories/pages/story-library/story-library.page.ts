import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NgClass, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  addOutline,
  playOutline,
  timeOutline,
  sparklesOutline,
  trashOutline,
  chevronDownCircleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  warningOutline,
  addCircleOutline,
  gridOutline,
  ellipsisHorizontalOutline,
} from 'ionicons/icons';
import type { Story, PlatformStoryCard, StoryDifficulty, StoryCategory } from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { SyncService } from '../../../../core/services/sync.service';
import { GenerateStorySheetComponent } from '../../components/generate-story-sheet/generate-story-sheet.component';
import { SubscriptionStore } from '../../../subscription/store/subscription.store';
import { PaywallModalComponent } from '../../../subscription/components/paywall-modal/paywall-modal.component';
import { PlatformStoryApiService } from '../../services/platform-story-api.service';

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
    IonContent, IonHeader, IonToolbar, IonIcon,
    IonRefresher, IonRefresherContent, IonSpinner,
    NgClass, TitleCasePipe,
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

  readonly levelFilters    = LEVEL_FILTERS;
  readonly categoryFilters = STORY_CATEGORIES;

  readonly filteredPlatformStories = computed(() => {
    const level    = this.selectedLevel();
    const category = this.selectedCategory();
    return this.platformStories().filter(s => {
      if (level    && s.level    !== level)    return false;
      if (category && s.category !== category) return false;
      return true;
    });
  });

  constructor() {
    addIcons({
      bookOutline, addOutline, playOutline, timeOutline, sparklesOutline,
      trashOutline, chevronDownCircleOutline, chevronBackOutline, chevronForwardOutline,
      warningOutline, addCircleOutline, gridOutline, ellipsisHorizontalOutline,
    });

    effect(async () => {
      const err = this.storyStore.extendError();
      if (err) {
        const toast = await this.toastCtrl.create({
          message: 'Extension failed — please try again.',
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

  selectCategory(category: StoryCategory): void {
    this.selectedCategory.set(this.selectedCategory() === category ? null : category);
  }

  navigateToPlatformStory(id: string): void {
    this.router.navigate(['/stories/platform', id]);
  }

  navigateToExplore(): void {
    this.router.navigate(['/stories/explore']);
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
    const sheet = await this.actionSheetCtrl.create({
      buttons: [
        {
          text: 'Delete story',
          role: 'destructive',
          handler: () => this.confirmDelete(story),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmDelete(story: Story): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete story',
      message: `Remove "${story.title}"? The audio will also be deleted.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
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
    return `${mins} min`;
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

  articleClass(article: string | null): string {
    if (article === 'der') return 'art-der';
    if (article === 'die') return 'art-die';
    if (article === 'das') return 'art-das';
    return '';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private loadPlatformStories(): void {
    this.isLoadingExplore.set(true);
    this.exploreError.set(false);
    this.platformApi.getAll({ limit: 20 }).subscribe({
      next: res => {
        this.platformStories.set(res.stories);
        this.isLoadingExplore.set(false);
      },
      error: () => {
        this.isLoadingExplore.set(false);
        this.exploreError.set(true);
      },
    });
  }
}
