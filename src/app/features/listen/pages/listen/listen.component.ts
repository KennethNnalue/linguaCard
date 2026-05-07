import { Component, computed, inject, Injector, OnDestroy, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  ellipsisHorizontalOutline,
  playOutline,
  pauseOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  shuffleOutline,
  repeatOutline,
} from 'ionicons/icons';
import { ConfidenceRating } from '../../../../core/models/mock-data';
import { MockCategoryService, MockListenService } from '../../../../core/services/mock-services';
import { CardStore } from '../../../../core/store/card.store';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { PlaylistSourceSheetComponent } from '../../components/playlist-source-sheet/playlist-source-sheet.component';

type PlaylistMode = 'word-meaning' | 'examples-only' | 'deep-dive';

@Component({
  selector: 'app-listen',
  templateUrl: './listen.component.html',
  styleUrls: ['./listen.component.scss', './listen.browser.scss', './listen.player.scss', './listen.controls.scss'],
  imports: [IonContent, IonHeader, IonIcon, IonToolbar, ArticleBadgeComponent],
})
export class ListenComponent implements OnInit, OnDestroy {
  private readonly listenService = inject(MockListenService);
  private readonly cardStore = inject(CardStore);
  private readonly categoryService = inject(MockCategoryService);
  private readonly modalCtrl = inject(ModalController);
  private readonly navCtrl = inject(NavController);
  private readonly injector = inject(Injector);

  constructor() {
    addIcons({
      chevronBackOutline,
      ellipsisHorizontalOutline,
      playOutline,
      pauseOutline,
      playSkipBackOutline,
      playSkipForwardOutline,
      shuffleOutline,
      repeatOutline,
    });
  }

  // ── View state ─────────────────────────────────────────────────────────────
  readonly inPlayerView = signal(false);

  // ── Service state proxies ──────────────────────────────────────────────────
  readonly queue = this.listenService.queue;
  readonly currentIndex = this.listenService.currentIndex;
  readonly isPlaying = this.listenService.isPlaying;
  readonly playbackMode = this.listenService.playbackMode;
  readonly playbackSpeed = this.listenService.playbackSpeed;
  readonly isShuffled = this.listenService.isShuffled;
  readonly ratingWindowVisible = this.listenService.ratingWindowVisible;
  readonly ratingCountdown = this.listenService.ratingCountdown;
  readonly activeSourceLabel = this.listenService.activeSourceLabel;
  readonly currentCard = this.listenService.currentCard;
  readonly categories = this.categoryService.categories;

  readonly SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];
  readonly MODES: { value: PlaylistMode; label: string; desc: string }[] = [
    { value: 'word-meaning', label: 'Word + meaning', desc: 'Compact listen' },
    { value: 'examples-only', label: 'Examples', desc: 'Full sentences' },
    { value: 'deep-dive', label: 'Deep dive', desc: '+ grammar tip' },
  ];
  readonly RATINGS: { value: ConfidenceRating; label: string }[] = [
    { value: 0, label: 'Blank' },
    { value: 1, label: 'Hard' },
    { value: 2, label: 'Hmm' },
    { value: 3, label: 'Good' },
    { value: 4, label: 'Easy' },
    { value: 5, label: 'Nailed' },
  ];

  // ── Computed ───────────────────────────────────────────────────────────────
  readonly progressPercent = computed(() => {
    const q = this.queue();
    return q.length ? (this.currentIndex() / q.length) * 100 : 0;
  });

  readonly activeCategoryNames = computed(() => {
    const queue = this.queue();
    if (!queue.length) return '';
    const cats = this.categories();
    const ids = [...new Set(queue.flatMap(c => c.categoryIds))];
    return ids
      .map(id => cats.find(c => c.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ') as string;
  });

  readonly currentArticleLabel = computed(() => {
    const card = this.currentCard();
    if (!card?.content.article) return '';
    const genderMap: Record<string, string> = {
      der: 'masculine', die: 'feminine', das: 'neuter',
    };
    const gender = card.content.gender ?? genderMap[card.content.article] ?? '';
    return `${card.content.article} — ${gender}`;
  });

  readonly currentCardCategory = computed(() => {
    const card = this.currentCard();
    if (!card) return '';
    const cats = this.categories();
    return cats.find(c => card.categoryIds.includes(c.id))?.name ?? '';
  });

  readonly playerArtClass = computed(() => {
    const article = this.currentCard()?.content.article;
    if (!article) return '';
    const map: Record<string, string> = {
      der: 'art-tint--der',
      die: 'art-tint--die',
      das: 'art-tint--das',
    };
    return map[article] ?? '';
  });

  readonly estimatedMinutes = computed(() =>
    Math.max(1, Math.ceil(this.queue().length * 0.25))
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(filter(loading => !loading), take(1))
      .subscribe(() => {
        const dueCards = this.cardStore.dueCards();
        if (dueCards.length) {
          this.listenService.loadPlaylist(dueCards, "Today's due words");
        } else {
          const all = this.cardStore.filteredCards();
          this.listenService.loadPlaylist(all.slice(0, 20), 'All words');
        }
      });
  }

  ngOnDestroy(): void {
    this.listenService.pause();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  startPlayback(): void {
    this.inPlayerView.set(true);
    this.listenService.play();
  }

  togglePlay(): void {
    this.listenService.togglePlay();
  }

  next(): void {
    this.listenService.next();
  }

  prev(): void {
    this.listenService.prev();
  }

  seekAndPlay(index: number): void {
    this.inPlayerView.set(true);
    this.listenService.seekTo(index);
    if (!this.isPlaying()) this.listenService.play();
  }

  setMode(mode: PlaylistMode): void {
    this.listenService.setMode(mode);
  }

  setSpeed(speed: number): void {
    this.listenService.setSpeed(speed);
  }

  toggleShuffle(): void {
    this.listenService.toggleShuffle();
  }

  rateCard(rating: ConfidenceRating): void {
    this.listenService.rateCurrentCard(rating);
  }

  dismissRating(): void {
    this.listenService.dismissRating();
  }

  backToBrowser(): void {
    this.listenService.pause();
    this.inPlayerView.set(false);
  }

  goBack(): void {
    if (this.inPlayerView()) {
      this.backToBrowser();
    } else {
      this.navCtrl.back();
    }
  }

  async openSourceSelector(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: PlaylistSourceSheetComponent,
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.cards && data?.label) {
      this.listenService.loadPlaylist(data.cards, data.label);
      if (data.mode) this.listenService.setMode(data.mode);
    }
  }
}
