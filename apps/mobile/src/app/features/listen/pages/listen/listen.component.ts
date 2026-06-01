import { Component, computed, inject, Injector, OnDestroy, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonIcon, IonToolbar, ModalController, ViewWillLeave } from '@ionic/angular/standalone';
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
import {Card, ConfidenceRating} from '@lingua-card/shared/domain';
import {CardStore} from '../../../vault/store/card.store';
import {CategoryStore} from '../../../vault/store/category.store';
import {ListenStore} from '../../store/listen.store';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';
import {PlaylistSourceSheetComponent} from '../../components/playlist-source-sheet/playlist-source-sheet.component';
import {WordCardComponent} from '../../../../shared/ui/word-card/word-card.component';
import {getCategoryName} from '../../../../shared/helpers/helpers';
import {WordAudioService} from '../../../../shared/audio/word-audio.service';

type PlaylistMode = 'word-meaning' | 'examples-only' | 'deep-dive';

@Component({
  selector: 'lc-listen',
  templateUrl: './listen.component.html',
  styleUrls: ['./listen.component.scss', './listen.browser.scss', './listen.player.scss', './listen.controls.scss'],
  imports: [IonContent, IonHeader, IonIcon, IonToolbar, ArticleBadgeComponent, WordCardComponent],
})
export class ListenComponent implements OnInit, OnDestroy, ViewWillLeave {
  private readonly listenStore = inject(ListenStore);
  private readonly cardStore = inject(CardStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly wordAudio = inject(WordAudioService);

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

  // ── Store state proxies ────────────────────────────────────────────────────
  readonly queue = this.listenStore.queue;
  readonly currentIndex = this.listenStore.currentIndex;
  readonly isPlaying = this.listenStore.isPlaying;
  readonly playbackMode = this.listenStore.playbackMode;
  readonly playbackSpeed = this.listenStore.playbackSpeed;
  readonly isShuffled = this.listenStore.isShuffled;
  readonly ratingWindowVisible = this.listenStore.ratingWindowVisible;
  readonly ratingCountdown = this.listenStore.ratingCountdown;
  readonly activeSourceLabel = this.listenStore.activeSourceLabel;
  readonly currentCard = this.listenStore.currentCard;
  readonly categories = this.categoryStore.categories;

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
    const collectionId = this.route.snapshot.queryParamMap.get('collectionId');
    toObservable(this.cardStore.isLoading, { injector: this.injector })
      .pipe(filter(loading => !loading), take(1))
      .subscribe(() => {
        let dueCards = this.cardStore.dueCards();
        if (collectionId) {
          dueCards = dueCards.filter(c => c.collectionId === collectionId);
        }
        if (dueCards.length) {
          this.listenStore.loadPlaylist(dueCards, collectionId ? 'Collection words' : "Today's due words");
        } else {
          const all = collectionId
            ? this.cardStore.filteredCards().filter(c => c.collectionId === collectionId)
            : this.cardStore.filteredCards();
          this.listenStore.loadPlaylist(all.slice(0, 20), collectionId ? 'Collection words' : 'All words');
        }
      });
  }

  ionViewWillLeave(): void {
    this.listenStore.pause();
  }

  ngOnDestroy(): void {
    this.listenStore.pause();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  startPlayback(): void {
    this.inPlayerView.set(true);
    this.listenStore.play();
  }

  togglePlay(): void {
    this.listenStore.togglePlay();
  }

  next(): void {
    this.listenStore.next();
  }

  prev(): void {
    this.listenStore.prev();
  }

  seekAndPlay(index: number): void {
    this.inPlayerView.set(true);
    this.listenStore.seekTo(index);
    if (!this.isPlaying()) this.listenStore.play();
  }

  setMode(mode: PlaylistMode): void {
    this.listenStore.setMode(mode);
  }

  setSpeed(speed: number): void {
    this.listenStore.setSpeed(speed);
  }

  toggleShuffle(): void {
    this.listenStore.toggleShuffle();
  }

  rateCard(rating: ConfidenceRating): void {
    this.listenStore.rateCurrentCard(rating);
  }

  dismissRating(): void {
    this.listenStore.dismissRating();
  }

  backToBrowser(): void {
    this.listenStore.pause();
    this.inPlayerView.set(false);
  }

  getCategoryLabel(card: Card): string {
    return getCategoryName(card.categoryIds?.[0], this.categories());
  }

  openCardDetail(card: Card): void {
    this.router.navigate(['/vault', card.id]);
  }

  playCardAudio(card: Card): void {
    void this.wordAudio.playCard(card);
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
      this.listenStore.loadPlaylist(data.cards, data.label);
      if (data.mode) this.listenStore.setMode(data.mode);
    }
  }
}
