import {Component, computed, inject, signal} from '@angular/core';
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
import {RING_CIRCUMFERENCE_OUTER} from '../../../review/models/review.model';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {UserMenuComponent} from '../../../../shared/components/user-menu/user-menu.component';
import {AddWordSheetComponent} from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import {ResetDataSheetComponent} from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
import {ReviewStatsStore} from '../../../../shared/srs/review-stats.store';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {isDue, isNew} from '../../../../shared/srs/srs-status';
import {Card} from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
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
  private readonly wordAudio = inject(WordAudioService);
  private readonly modalCtrl = inject(ModalController);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({playOutline, libraryOutline});
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

  // Facade — session-derived stats use local-time bucketing
  readonly completedToday = this.reviewStats.completedToday;

  readonly ringProgress = computed(() => {
    const total = this.totalDue() + this.completedToday();
    if (total === 0) return 0;
    return Math.min(1, this.completedToday() / total);
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

  // ─── Stat cards — all from facade or CardStore, no bespoke re-derivation ────
  readonly dayStreak = this.reviewStats.dayStreak;
  readonly last7DaysActivity = this.reviewStats.last7DaysActivity;
  readonly totalCards = this.cardStore.totalCount;
  readonly masteredCount = this.cardStore.masteredCount;

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

  handleRefresh(event: any): void {
    this.cardStore.loadCards();
    setTimeout(() => event.target.complete(), 800);
  }

  playWotd(): void {
    const card = this.wordOfTheDay();
    if (!card) return;
    void this.wordAudio.playCard(card);
  }

  playAudio(card: Card): void {
    void this.wordAudio.playCard(card);
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
