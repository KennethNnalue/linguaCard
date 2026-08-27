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
import {ReviewFilterService} from '../../../review/services/review-filter.service';
import {ReviewPlayerService} from '../../../review/services/review-player.service';
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
import {Card} from '@lingua-card/shared/domain';
import {GoalPromptPolicyService} from '../../../settings/services/goal-prompt-policy.service';
import {HomePresentationStore} from '../../store/home-presentation.store';
import {ButtonComponent} from '../../../../shared/ui/button/button.component';
import {VaultV2Store} from '../../../vault/store/vault-v2.store';

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
    ButtonComponent,
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
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly filterService = inject(ReviewFilterService);
  private readonly goalPromptPolicy = inject(GoalPromptPolicyService);
  readonly homePresentation = inject(HomePresentationStore);
  private readonly vaultStore = inject(VaultV2Store);

  private goalPromptCheckInProgress = false;

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
      if (this.settingsStore.needsGoalSetup()) void this.showGoalsPromptIfEligible();
    });
  }

  ionViewWillEnter(): void {
    void this.cardStore.loadCards();
    this.vaultStore.ensureActiveVault();
    this.collectionStore.loadCollections();
    if (this.settingsStore.needsGoalSetup()) void this.showGoalsPromptIfEligible();
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

  private async showGoalsPromptIfEligible(): Promise<void> {
    if (this.goalPromptCheckInProgress) return;
    this.goalPromptCheckInProgress = true;
    try {
      const userId = this.authService.currentUser()?.id;
      if (!userId || !await this.goalPromptPolicy.shouldShow(userId)) return;
      const modal = await this.modalCtrl.create({
        component: StudyGoalsPromptComponent,
        cssClass: 'goals-prompt-modal-wrapper',
      });
      await this.goalPromptPolicy.markShown(userId);
      await modal.present();
    } finally {
      this.goalPromptCheckInProgress = false;
    }
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
    const items = collectionId
      ? this.vaultStore.learningItems().filter(item => item.collectionIds.includes(collectionId))
      : this.vaultStore.learningItems();
    return items.filter(item => item.reviewState.stage === 'new').length;
  });

  readonly reviewsCount = computed(() => {
    const collectionId = this.selectedCollectionId();
    const now = new Date();
    const items = collectionId
      ? this.vaultStore.learningItems().filter(item => item.collectionIds.includes(collectionId))
      : this.vaultStore.learningItems();
    return items.filter(item => item.reviewState.masterySource !== 'manual'
      && item.reviewState.dueAt !== undefined
      && new Date(item.reviewState.dueAt).getTime() <= now.getTime()).length;
  });

  readonly totalDue = computed(() => this.newCardsCount() + this.reviewsCount());

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
  readonly streakFreezes = this.engagementStore.streakFreezes;
  readonly streakFreezeProgress = this.engagementStore.streakFreezeProgress;
  readonly streakReady = computed(() => this.engagementStore.loadState().status === 'ready');
  readonly last7DaysActivity = this.engagementStore.last7DaysActivity;
  readonly totalCards = computed(() => this.vaultStore.learningItems().length);
  readonly masteredCount = computed(() => this.vaultStore.learningItems()
    .filter(item => item.reviewState.stage === 'mastered' && item.reviewState.relearning === undefined).length);
  readonly dailyGoal = this.engagementStore.dailyGoal;
  readonly weeklyGoal = computed(() => this.settingsStore.weeklyGoal());

  readonly dailyGoalPct = computed(() => {
    const goal = this.dailyGoal();
    if (goal === 0) return 0;
    return Math.min(1, this.completedToday() / goal);
  });

  readonly GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 28;

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
  readonly yesterdayWasProtected = computed(() => {
    const days = this.engagementStore.recentDays();
    return days.at(-2)?.status === 'protected_by_freeze';
  });

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
    if (collectionId) {
      const cards = this.cardStore.cards().filter(card => card.collectionId === collectionId);
      void this.reviewPlayer.open(cards, { kind: 'collection', collectionId });
      return;
    }
    const dailyGoal = this.settingsStore.dailyGoal();
    void this.reviewPlayer.openSource({ kind: 'daily' }, dailyGoal);
  }

  performHeroAction(): void {
    if (this.homePresentation.hero().action === 'add-vocabulary') {
      void this.openAddWord();
      return;
    }
    this.startSession();
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
