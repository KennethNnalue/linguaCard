import {Component, computed, inject, signal} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {playOutline} from 'ionicons/icons';
import {AuthService} from '../../../../core/services/auth.service';
import {CardStore} from '../../../vault/store/card.store';
import {CategoryStore} from '../../../vault/store/category.store';
import {CollectionStore} from '../../../vault/store/collection.store';
import {ReviewStore} from '../../../review/store/review.store';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {UserMenuComponent} from '../../../../shared/components/user-menu/user-menu.component';
import {AddWordSheetComponent} from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import {ResetDataSheetComponent} from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';
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
  private readonly reviewStore = inject(ReviewStore);
  private readonly wordAudio = inject(WordAudioService);
  private readonly modalCtrl = inject(ModalController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({playOutline});
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
  readonly totalDue = computed(() => {
    const id = this.selectedCollectionId();
    const due = this.cardStore.dueCards();
    return id ? due.filter(c => c.collectionId === id).length : due.length;
  });

  readonly newCardsCount = computed(() => {
    const cards = this.cardStore.cards();
    const id = this.selectedCollectionId();
    const filtered = id ? cards.filter(c => c.collectionId === id) : cards;
    return filtered.filter(c => !c.srsState || c.srsState.state === 'new').length;
  });

  readonly reviewsCount = computed(() => {
    return Math.max(0, this.totalDue() - this.newCardsCount());
  });

  readonly completedToday = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    return this.reviewStore.sessionHistory()
      .filter(s => s.completedAt?.startsWith(today))
      .reduce((sum, s) => sum + (s.reviewedCards?.length ?? 0), 0);
  });

  readonly ringProgress = computed(() => {
    const total = this.totalDue() + this.completedToday();
    if (total === 0) return 0;
    return Math.min(1, this.completedToday() / total);
  });

  // SVG circumference for r=28: 2π*28 ≈ 175.93
  readonly ringOffset = computed(() => {
    const circumference = 2 * Math.PI * 28;
    return circumference * (1 - this.ringProgress());
  });

  readonly selectedCollectionLabel = computed(() => {
    const id = this.selectedCollectionId();
    if (!id) return 'All collections';
    const col = this.collectionStore.collections().find(c => c.id === id);
    return col ? `${col.emoji} ${col.name}` : 'All collections';
  });

  // ─── Stat cards ──────────────────────────────────────────────────────────────
  readonly dayStreak = computed(() => {
    // Derive streak from session history — count consecutive days with sessions
    const sessions = this.reviewStore.sessionHistory();
    if (sessions.length === 0) return 0;
    const dates = new Set(sessions.map(s => s.completedAt?.split('T')[0]).filter(Boolean));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  });

  readonly last7DaysActivity = computed(() => {
    const sessions = this.reviewStore.sessionHistory();
    const dates = new Set(sessions.map(s => s.completedAt?.split('T')[0]).filter(Boolean));
    const today = new Date();
    return Array.from({length: 7}, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return dates.has(d.toISOString().split('T')[0]);
    });
  });

  readonly totalCards = this.cardStore.totalCount;
  readonly masteredCount = this.cardStore.masteredCount;

  // ─── Word of the Day ─────────────────────────────────────────────────────────
  readonly wordOfTheDay = computed(() => {
    const cards = this.cardStore.cards();
    if (cards.length === 0) return null;
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    return cards[dayIndex % cards.length];
  });

  // ─── Weekly chart ────────────────────────────────────────────────────────────
  readonly weeklyData = computed(() => {
    const sessions = this.reviewStore.sessionHistory();
    const today = new Date();
    const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const currentDayOfWeek = (today.getDay() + 6) % 7; // Mon=0

    const data = labels.map((label, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - currentDayOfWeek + i);
      const dateStr = d.toISOString().split('T')[0];
      const count = sessions
        .filter(s => s.completedAt?.startsWith(dateStr))
        .reduce((sum, s) => sum + (s.reviewedCards?.length ?? 0), 0);
      return {label, count, isToday: i === currentDayOfWeek, isPast: i < currentDayOfWeek};
    });

    const maxCount = Math.max(...data.map(d => d.count), 1);
    return data.map(d => ({...d, heightPct: Math.max(4, Math.round((d.count / maxCount) * 50))}));
  });

  readonly weeklyTotal = computed(() =>
    this.weeklyData().reduce((sum, d) => sum + d.count, 0)
  );

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
      initialBreakpoint: 0.95,
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
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Filter by collection',
      buttons: [
        {text: 'All collections', handler: () => this.selectedCollectionId.set(null)},
        ...collections.map(col => ({
          text: `${col.emoji} ${col.name}`,
          handler: () => this.selectedCollectionId.set(col.id),
        })),
        {text: 'Cancel', role: 'cancel'},
      ],
    });
    await actionSheet.present();
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
