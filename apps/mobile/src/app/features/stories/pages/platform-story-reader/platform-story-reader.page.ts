import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  ViewWillLeave,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import type {
  PlatformStory,
  StoryKeyword,
  WordTimestamp,
  UserStoryProgress,
} from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { PlatformStoryApiService } from '../../services/platform-story-api.service';
import { ReviewStore } from '../../../review/store/review.store';
import { CardStore } from '../../../vault/store/card.store';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { QuizTabComponent } from '../../components/quiz-tab/quiz-tab.component';
import { KeywordsTabComponent } from '../../components/keywords-tab/keywords-tab.component';
import { GrammarTabComponent } from '../../components/grammar-tab/grammar-tab.component';
import { firstValueFrom } from 'rxjs';
import { ReviewRoute } from '../../../review/models/review.model';

export type PlatformReaderTab = 'story' | 'quiz' | 'keywords' | 'grammar';

@Component({
  selector: 'lc-platform-story-reader',
  templateUrl: './platform-story-reader.page.html',
  styleUrls: ['./platform-story-reader.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonIcon,
    NgClass,
    QuizTabComponent,
    KeywordsTabComponent,
    GrammarTabComponent,
  ],
})
export class PlatformStoryReaderPage implements OnInit, OnDestroy, ViewWillLeave {
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly api         = inject(PlatformStoryApiService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly cardStore   = inject(CardStore);
  private readonly wordAudio   = inject(WordAudioService);

  readonly story    = signal<PlatformStory | null>(null);
  readonly progress = signal<UserStoryProgress | null>(null);
  readonly isLoading = signal(false);

  readonly activeTab = signal<PlatformReaderTab>('story');
  readonly showTranslation = signal(false);

  readonly quizCurrentIdx = signal(0);
  readonly quizAnswered   = signal<Record<string, string>>({});

  readonly pronunciationLoading = computed(() => this.wordAudio.isLoading());

  // ── Audio player ────────────────────────────────────────────────
  readonly isPlaying    = signal(false);
  readonly activeWordIdx = signal(-1);
  readonly speed        = signal(1.0);
  readonly progressPct  = signal(0);

  private audio: HTMLAudioElement | null = null;
  private timeupdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;

  readonly speeds     = [0.5, 0.75, 1.0, 1.25, 1.5];
  readonly speedLabel = computed(() => `${this.speed()}×`);

  readonly words = computed<Array<WordTimestamp & { idx: number }>>(() => {
    const s = this.story();
    if (!s) return [];
    return s.wordTimestamps.map((w, i) => ({ ...w, idx: i }));
  });

  readonly categoryLabel = computed(() => {
    const s = this.story();
    if (!s) return '';
    return STORY_CATEGORIES.find(c => c.value === s.category)?.label ?? s.category;
  });

  constructor() {
    addIcons({ arrowBackOutline });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.isLoading.set(true);

    try {
      const story = await firstValueFrom(this.api.getById(id));
      this.story.set(story);

      // Fire-and-forget: mark as read + load progress in parallel
      this.api.markAsRead(id).subscribe();
      this.api.getProgress(id).subscribe(p => this.progress.set(p));

      if (story.audioUrl) {
        this.initAudio(story.audioUrl, story.wordTimestamps);
      }
    } catch {
      this.router.navigate(['/stories']);
    } finally {
      this.isLoading.set(false);
    }
  }

  ionViewWillLeave(): void {
    this.pauseAudio();
  }

  ngOnDestroy(): void {
    this.destroyAudio();
  }

  setTab(tab: PlatformReaderTab): void {
    if (tab !== 'story') this.pauseAudio();
    this.activeTab.set(tab);
  }

  // ── Player controls ──────────────────────────────────────────────

  togglePlay(): void {
    if (!this.audio) return;
    if (this.isPlaying()) {
      this.audio.pause();
      this.isPlaying.set(false);
    } else {
      void this.audio.play();
      this.isPlaying.set(true);
    }
  }

  restart(): void {
    if (!this.audio) return;
    this.audio.currentTime = 0;
    this.activeWordIdx.set(-1);
    this.progressPct.set(0);
    if (this.isPlaying()) void this.audio.play();
  }

  cycleSpeed(): void {
    const idx  = this.speeds.indexOf(this.speed());
    const next = this.speeds[(idx + 1) % this.speeds.length];
    this.speed.set(next);
    if (this.audio) this.audio.playbackRate = next;
  }

  seekToPercent(event: MouseEvent): void {
    if (!this.audio || !this.audio.duration) return;
    const bar   = event.currentTarget as HTMLElement;
    const ratio = event.offsetX / bar.clientWidth;
    this.audio.currentTime = ratio * this.audio.duration;
  }

  currentTimeLabel(): string {
    if (!this.audio) return '0:00';
    return this.formatTime(this.audio.currentTime);
  }

  durationLabel(): string {
    if (!this.audio || !this.audio.duration) {
      const ms = this.story()?.audioDurationMs ?? 0;
      return ms > 0 ? this.formatTime(ms / 1000) : '0:00';
    }
    return this.formatTime(this.audio.duration);
  }

  isVocabActive(wt: WordTimestamp & { idx: number }): boolean {
    return wt.isVocab && wt.idx === this.activeWordIdx();
  }

  // ── Keywords ────────────────────────────────────────────────────

  onKeywordsPlayWord(keyword: StoryKeyword): void {
    const text = keyword.article
      ? `${keyword.article} ${keyword.germanBase}`
      : keyword.germanBase;
    void this.wordAudio.play(text, 'de-DE');
  }

  onKeywordCardClick(keyword: StoryKeyword): void {
    if (keyword.cardId) {
      void this.router.navigate(['/vault', keyword.cardId]);
    }
  }

  onAddToTraining(_keyword: StoryKeyword): void {
    // not applicable for platform stories (no vault card required)
  }

  onMemorizeAll(): void {
    const s = this.story();
    if (!s) return;
    const cardIds = new Set(
      (s.keywords ?? []).map(k => k.cardId).filter((id): id is string => !!id)
    );
    if (cardIds.size === 0) return;

    const cards = this.cardStore.cards().filter(c => cardIds.has(c.id));
    if (cards.length === 0) return;

    this.reviewStore.startSession(cards, null, `📖 ${s.title}`);
    void this.router.navigate([ReviewRoute.PLAYER]);
  }

  goBack(): void {
    this.router.navigate(['/stories']);
  }

  // ── Private ──────────────────────────────────────────────────────

  private initAudio(url: string, timestamps: WordTimestamp[]): void {
    this.audio = new Audio(url);
    this.audio.playbackRate = this.speed();

    this.timeupdateHandler = () => {
      const ms  = this.audio!.currentTime * 1000;
      const dur = this.audio!.duration * 1000 || 1;
      this.progressPct.set(Math.min(100, (ms / dur) * 100));
      const idx = timestamps.findIndex(w => ms >= w.startMs && ms < w.endMs);
      this.activeWordIdx.set(idx);
    };

    this.endedHandler = () => {
      this.isPlaying.set(false);
      this.activeWordIdx.set(-1);
    };

    this.audio.addEventListener('timeupdate', this.timeupdateHandler);
    this.audio.addEventListener('ended', this.endedHandler);
  }

  private pauseAudio(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.isPlaying.set(false);
    }
  }

  private destroyAudio(): void {
    if (this.audio) {
      if (this.timeupdateHandler) this.audio.removeEventListener('timeupdate', this.timeupdateHandler);
      if (this.endedHandler)      this.audio.removeEventListener('ended', this.endedHandler);
      this.audio.pause();
      this.audio = null;
    }
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
