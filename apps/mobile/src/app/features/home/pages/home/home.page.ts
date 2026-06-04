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
import {RING_CIRCUMFERENCE_OUTER, sessionCardIds} from '../../../review/models/review.model';
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
    const overdue = id ? due.filter(c => c.collectionId === id).length : due.length;
    // Total study workload = overdue reviews + new cards (masteryLevel 0)
    return overdue + this.newCardsCount();
  });

  readonly newCardsCount = computed(() => {
    const cards = this.cardStore.cards();
    const id = this.selectedCollectionId();
    const filtered = id ? cards.filter(c => c.collectionId === id) : cards;
    return filtered.filter(c => (c.srsState?.masteryLevel ?? 0) === 0).length;
  });

  readonly reviewsCount = computed(() => {
    return Math.max(0, this.totalDue() - this.newCardsCount());
  });

  readonly completedToday = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    const seenIds = new Set<string>();
    for (const s of this.reviewStore.sessionHistory()) {
      if (s.completedAt?.startsWith(today)) {
        for (const id of sessionCardIds(s)) seenIds.add(id);
      }
    }
    return seenIds.size;
  });

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

  // ─── Stat cards ──────────────────────────────────────────────────────────────
  readonly dayStreak = computed(() => {
    const sessions = this.reviewStore.sessionHistory();
    if (sessions.length === 0) return 0;
    const dates = new Set(sessions.map(s => s.completedAt?.split('T')[0]).filter(Boolean));
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // A streak is active if there's a session today OR yesterday (grace period for
    // users who review late at night before midnight). Start counting from whichever
    // is the most recent day with activity.
    const yesterdayStr = new Date(today.getTime() - 86_400_000).toISOString().split('T')[0];
    const startOffset = dates.has(todayStr) ? 0 : dates.has(yesterdayStr) ? 1 : -1;
    if (startOffset === -1) return 0;

    let streak = 0;
    for (let i = startOffset; i < 365; i++) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const dateStr = d.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  });

  readonly last7DaysActivity = computed(() => {
    const sessions = this.reviewStore.sessionHistory();
    const dates = new Set(sessions.map(s => s.completedAt?.split('T')[0]).filter(Boolean));
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const streak = this.dayStreak();

    // Build the set of dates that belong to the current consecutive streak so
    // dots match the streak number exactly (not arbitrary historical activity days).
    const streakDates = new Set<string>();
    for (let i = 0; i < streak; i++) {
      const d = new Date(today.getTime() - i * 86_400_000);
      streakDates.add(d.toISOString().split('T')[0]);
    }
    // If streak started from yesterday (grace period), shift by 1
    if (streak > 0 && !dates.has(todayStr)) {
      streakDates.clear();
      for (let i = 1; i <= streak; i++) {
        const d = new Date(today.getTime() - i * 86_400_000);
        streakDates.add(d.toISOString().split('T')[0]);
      }
    }

    return Array.from({length: 7}, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return streakDates.has(d.toISOString().split('T')[0]);
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
      // Deduplicate by card ID — a card reviewed in multiple sessions on the same
      // day should only count once toward the daily total.
      const dayIds = new Set<string>();
      for (const s of sessions) {
        if (s.completedAt?.startsWith(dateStr)) {
          for (const id of sessionCardIds(s)) dayIds.add(id);
        }
      }
      return {label, count: dayIds.size, isToday: i === currentDayOfWeek, isPast: i < currentDayOfWeek};
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
