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
import {TranslatePipe, TranslateService} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {libraryOutline, notificationsOutline, playOutline} from 'ionicons/icons';
import {AuthService} from '../../../../core/services/auth.service';
import {LanguageService} from '../../../../core/services/language.service';
import {CardStore} from '../../../vault/store/card.store';
import {CategoryStore} from '../../../vault/store/category.store';
import {CollectionStore} from '../../../vault/store/collection.store';
import {
  RING_CIRCUMFERENCE_OUTER,
  ReviewRoute,
} from '../../../review/models/review.model';
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewStore} from '../../../review/store/review.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {UserMenuComponent} from '../../../../shared/components/user-menu/user-menu.component';
import {AddWordSheetComponent} from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import {ResetDataSheetComponent} from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {EngagementStore} from '../../../engagement/state/engagement.store';
import {SettingsStore} from '../../../settings/store/settings.store';
import {ShareStore} from '../../../sharing/store/share.store';
import {StreakMilestoneComponent} from '../../components/streak-milestone/streak-milestone.component';
import {GettingStartedChecklistComponent} from '../../components/getting-started-checklist/getting-started-checklist.component';
import {StudyGoalsPromptComponent} from '../../../settings/components/study-goals-prompt/study-goals-prompt.component';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {isDue, isNew} from '../../../review/domain/review-status';
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
    TranslatePipe,
    GettingStartedChecklistComponent,
  ],
})
export class HomePage {
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly engagementStore = inject(EngagementStore);
  private readonly settingsStore = inject(SettingsStore);
  readonly shareStore = inject(ShareStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly reviewStore = inject(ReviewStore);
  private readonly filterService = inject(ReviewFilterService);

  private readonly goalPromptShown = signal(false);

  constructor() {
    addIcons({playOutline, libraryOutline, notificationsOutline});
    effect(() => {
      const current = this.streak().current;
      if (StreakMilestoneComponent.shouldShow(current)) {
        const reached = [3, 7, 14, 30, 50, 100, 365].filter(m => m <= current);
        StreakMilestoneComponent.markShown(reached[reached.length - 1]);
        void this.showMilestoneModal(current);
      }
    });
    effect(() => {
      if (!this.goalPromptShown() && this.settingsStore.needsGoalSetup()) {
        this.goalPromptShown.set(true);
        void this.showGoalsPrompt();
      }
    });
  }

  private async showMilestoneModal(streakCurrent: number): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: StreakMilestoneComponent,
      componentProps: { streakCurrent },
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
    this.languageService.current(); // recompute on UI language change
    const h = new Date().getHours();
    if (h < 12) return this.translate.instant('home.greeting.morning');
    if (h < 17) return this.translate.instant('home.greeting.afternoon');
    return this.translate.instant('home.greeting.evening');
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
    const done = this.engagementStore.completedToday();
    const total = this.totalDue() + done;
    if (total === 0) return 0;
    return Math.min(1, done / total);
  });

  readonly ringOffset = computed(() =>
    RING_CIRCUMFERENCE_OUTER * (1 - this.ringProgress())
  );

  readonly selectedCollectionLabel = computed(() => {
    this.languageService.current(); // recompute on UI language change
    const id = this.selectedCollectionId();
    if (!id) return this.translate.instant('home.collectionFilter.allLabel');
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : this.translate.instant('home.collectionFilter.allLabel');
  });

  // ─── Stat cards + goal progress ─────────────────────────────────────────────
  readonly completedToday = this.engagementStore.completedToday;
  readonly dayStreak = this.engagementStore.dayStreak;
  readonly streak = this.engagementStore.streak;
  readonly streakReady = computed(() => this.engagementStore.loadState().status === 'ready');
  readonly last7DaysActivity = this.engagementStore.last7DaysActivity;
  readonly totalCards = this.cardStore.totalCount;
  readonly masteredCount = this.cardStore.masteredCount;
  readonly dailyGoal = this.engagementStore.dailyGoal;
  readonly weeklyGoal = computed(() => this.settingsStore.weeklyGoal());

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
  readonly weeklyData = this.engagementStore.weeklyData;
  readonly weeklyTotal = this.engagementStore.weeklyTotal;

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
    await this.bottomSheet.open(this.translate.instant('vault.collectionFilter.title'), [
      {label: this.translate.instant('home.collectionFilter.allLabel'), icon: 'library-outline', handler: () => this.selectedCollectionId.set(null)},
      ...collections.map(col => ({
        label: `${col.emoji ?? '📚'} ${col.name}`,
        handler: () => this.selectedCollectionId.set(col.id),
      })),
      {label: this.translate.instant('common.cancel'), role: 'cancel' as const},
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
    const dailyGoal = this.settingsStore.dailyGoal();
    void this.reviewStore.startSession(
      collectionId ? { kind: 'collection', collectionId } : { kind: 'daily' },
      dailyGoal,
    ).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
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
