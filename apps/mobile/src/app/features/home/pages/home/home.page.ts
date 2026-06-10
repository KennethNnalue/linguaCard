import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {libraryOutline, playOutline} from 'ionicons/icons';
import {AuthService} from '../../../../core/services/auth.service';
import {CardStore} from '../../../vault/store/card.store';
import {CategoryStore} from '../../../vault/store/category.store';
import {CollectionStore} from '../../../vault/store/collection.store';
import {
  RING_CIRCUMFERENCE_OUTER,
  ReviewLimit,
  ReviewRoute,
  ReviewSortOrder,
  ReviewSource,
} from '../../../review/models/review.model';
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewStore} from '../../../review/store/review.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {UserMenuComponent} from '../../../../shared/components/user-menu/user-menu.component';
import {AddWordSheetComponent} from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import {ResetDataSheetComponent} from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {ReviewStatsStore} from '../../../../shared/srs/review-stats.store';
import {SettingsStore} from '../../../settings/store/settings.store';
import {StreakMilestoneComponent} from '../../components/streak-milestone/streak-milestone.component';
import {StudyGoalsPromptComponent} from '../../../settings/components/study-goals-prompt/study-goals-prompt.component';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {isDue, isNew} from '../../../../shared/srs/srs-status';
import {Card} from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    UserMenuComponent,
    IonRefresherContent,
    IonRefresher,
    IonContent,
    IonIcon,
    IonToolbar,
    IonHeader,
    WordCardComponent,
  ],
})
export class HomePage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly reviewStats = inject(ReviewStatsStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly reviewStore = inject(ReviewStore);
  private readonly filterService = inject(ReviewFilterService);

  private readonly goalPromptShown = signal(false);

  constructor() {
    addIcons({playOutline, libraryOutline});
    effect(() => {
      const current = this.streak().current;
      if (StreakMilestoneComponent.shouldShow(current)) {
        const reached = [3, 7, 14, 30, 50, 100, 365].filter(m => m <= current);
        StreakMilestoneComponent.markShown(reached[reached.length - 1]);
        void this.showMilestoneModal();
      }
    });
    effect(() => {
      if (!this.goalPromptShown() && this.settingsStore.needsGoalSetup()) {
        this.goalPromptShown.set(true);
        void this.showGoalsPrompt();
      }
    });
  }

  private async showMilestoneModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: StreakMilestoneComponent,
      cssClass: 'milestone-modal-wrapper',
      breakpoints: [0, 0.55, 0.7],
      initialBreakpoint: 0.55,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  private async showGoalsPrompt(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: StudyGoalsPromptComponent,
      cssClass: 'goals-prompt-modal-wrapper',
      breakpoints: [0, 0.6, 0.75],
      initialBreakpoint: 0.6,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  readonly user = this.authService.currentUser;
  readonly menuOpen = signal(false);
  readonly loading = this.cardStore.isLoading;
  readonly categories = this.categoryStore.categories;
  readonly selectedCollectionId = signal<string | null>(null);

  // ─── Greeting ───────────────────────────────────────────────────────────────
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  });

  // ─── Hero ring stats ─────────────────────────────────────────────────────────
  readonly newCardsCount = computed(() => {
    const collectionId = this.selectedCollectionId();
    const cards = collectionId
      ? this.cardStore.cards().filter(c => c.collectionId === collectionId)
      : this.cardStore.cards();
    return cards.filter(isNew).length;
  });

  readonly reviewsCount = computed(() => {
    const collectionId = this.selectedCollectionId();
    const now = new Date();
    const cards = collectionId
      ? this.cardStore.cards().filter(c => c.collectionId === collectionId)
      : this.cardStore.cards();
    return cards.filter(c => isDue(c, now)).length;
  });

  // Total study workload = new (never studied) + reviews (studied & due)
  readonly totalDue = computed(() => this.newCardsCount() + this.reviewsCount());

  // Hero ring (due cards progress)
  readonly ringProgress = computed(() => {
    const done = this.reviewStats.completedToday();
    const total = this.totalDue() + done;
    if (total === 0) return 0;
    return Math.min(1, done / total);
  });

  readonly ringOffset = computed(() =>
    RING_CIRCUMFERENCE_OUTER * (1 - this.ringProgress())
  );

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'All collections';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'All collections';
  });

  // ─── Stat cards + goal progress ─────────────────────────────────────────────
  readonly completedToday = this.reviewStats.completedToday;
  readonly dayStreak = this.reviewStats.dayStreak;
  readonly streak = this.reviewStats.streak;
  readonly last7DaysActivity = this.reviewStats.last7DaysActivity;
  readonly totalCards = this.cardStore.totalCount;
  readonly masteredCount = this.cardStore.masteredCount;
  readonly dailyGoal = this.reviewStats.dailyGoal;
  readonly weeklyGoal = this.reviewStats.weeklyGoal;

  readonly dailyGoalPct = computed(() => {
    const goal = this.dailyGoal();
    if (goal === 0) return 0;
    return Math.min(1, this.completedToday() / goal);
  });

  // SVG ring: circumference for r=27 = 2*PI*27 ≈ 169.6
  readonly GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 27;

  readonly goalRingOffset = computed(() =>
    this.GOAL_RING_CIRCUMFERENCE * (1 - this.dailyGoalPct())
  );

  // ─── Word of the Day ─────────────────────────────────────────────────────────
  readonly wordOfTheDay = computed(() => {
    const cards = this.cardStore.cards();
    if (cards.length === 0) return null;
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    return cards[dayIndex % cards.length];
  });

  // ─── Weekly chart — from facade ──────────────────────────────────────────────
  readonly weeklyData = this.reviewStats.weeklyData;
  readonly weeklyTotal = this.reviewStats.weeklyTotal;

  // ─── Recent words ─────────────────────────────────────────────────────────────
  readonly recentCards = computed(() => {
    const cards = this.cardStore.cards();
    return [...cards]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  });

  // ─── Actions ─────────────────────────────────────────────────────────────────
  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  async openAddWord(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const {data} = await modal.onWillDismiss();
    if (data?.created) this.cardStore.loadCards();
  }

  async openResetSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ResetDataSheetComponent,
      breakpoints: [0, 0.65, 0.85],
      initialBreakpoint: 0.65,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async openCollectionPicker(): Promise<void> {
    const collections = this.collectionStore.collections();
    await this.bottomSheet.open('Filter by collection', [
      {label: 'All collections', icon: 'library-outline', handler: () => this.selectedCollectionId.set(null)},
      ...collections.map(col => ({
        label: `${col.emoji ?? '📚'} ${col.name}`,
        handler: () => this.selectedCollectionId.set(col.id),
      })),
      {label: 'Cancel', role: 'cancel' as const},
    ]);
  }

  handleRefresh(event: Event): void {
    this.cardStore.loadCards();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 800);
  }

  playWotd(): void {
    const card = this.wordOfTheDay();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playAudio(card: Card): void {
    void this.wordAudio.playCard(card);
  }

  startSession(): void {
    const collectionId = this.selectedCollectionId();
    const queue = this.filterService.buildQueue({
      source: collectionId ?? ReviewSource.ALL,
      masteryLevels: [0, 1, 2, 3, 4, 5],
      sortOrder: ReviewSortOrder.DUE_DATE,
      limit: ReviewLimit.DUE_TODAY,
    });
    if (!queue.length) {
      void this.router.navigate([ReviewRoute.HUB]);
      return;
    }
    this.reviewStore.startSession(queue, null, null);
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  navigateToCard(card: Card): void {
    this.router.navigate(['/vault', card.id]);
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categories());
  }

  get wotdGrammarInfo(): string {
    const card = this.wordOfTheDay();
    if (!card) return '';
    const parts: string[] = [];
    if (card.content.article) parts.push(`noun, ${card.content.article === 'der' ? 'masculine' : card.content.article === 'die' ? 'feminine' : 'neuter'}`);
    return parts.join(' ');
  }
}
