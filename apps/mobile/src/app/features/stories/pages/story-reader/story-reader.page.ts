import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronBackOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import type { Story, StoryKeyword } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { StoryPlayerService, STORY_PLAYBACK_SPEEDS, StoryPlaybackSpeed } from '../../services/story-player.service';
import { StoryWordSheetService } from '../../services/story-word-sheet.service';
import { StoryReaderLoaderService } from '../../services/story-reader-loader.service';
import { StoryReaderInteractionService } from '../../services/story-reader-interaction.service';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { QuizTabComponent } from '../../components/quiz-tab/quiz-tab.component';
import { KeywordsTabComponent } from '../../components/keywords-tab/keywords-tab.component';
import { GrammarTabComponent } from '../../components/grammar-tab/grammar-tab.component';
import { StoryTextComponent, StoryWordTap } from '../../components/story-text/story-text.component';
import { computeQuizScore, type ReaderTab, type WordDetail } from '../../models/reader.model';

@Component({
  selector: 'lc-story-reader',
  templateUrl: './story-reader.page.html',
  styleUrls: ['./story-reader.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StoryReaderInteractionService],
  imports: [
    IonContent,
    IonIcon,
    TitleCasePipe,
    TranslatePipe,
    QuizTabComponent,
    KeywordsTabComponent,
    GrammarTabComponent,
    StoryTextComponent,
  ],
})
export class StoryReaderPage implements OnInit, ViewWillEnter, ViewWillLeave {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storyStore = inject(StoryStore);
  readonly player = inject(StoryPlayerService);
  private readonly api = inject(StoryApiService);
  private readonly loader = inject(StoryReaderLoaderService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly wordSheet = inject(StoryWordSheetService);
  private readonly interaction = inject(StoryReaderInteractionService);
  private readonly translate = inject(TranslateService);
  private readonly toastCtrl = inject(ToastController);

  // ── Story state ─────────────────────────────────────────────────
  readonly story = signal<Story | null>(null);
  readonly audioLoading = signal(false);
  readonly audioGenerating = signal(false);

  // ── Tab navigation ───────────────────────────────────────────────
  readonly activeTab = signal<ReaderTab>('story');

  // ── Story tab: translation toggle ───────────────────────────────
  readonly showTranslation = signal(false);

  // ── Mark as learned ──────────────────────────────────────────────
  readonly isLearned = signal(false);

  // ── Quiz state (lifted here for LC-R12 persistence) ─────────────
  readonly quizCurrentIdx = signal(0);
  readonly quizAnswered = signal<Record<string, string>>({});

  // ── Enrichment state ─────────────────────────────────────────────
  readonly enriching = signal(false);

  // ── Pronunciation loading (forwarded from WordAudioService) ──
  readonly pronunciationLoading = computed(() => this.wordAudio.isLoading());

  // ── Audio player (delegated to StoryPlayerService) ───────────────
  readonly isPlaying = this.player.playing;
  readonly activeWordIdx = this.player.activeWordIdx;
  readonly activeSentenceIdx = this.player.activeSentenceIdx;
  readonly progressPct = this.player.progressPct;
  readonly repeatMode = this.player.repeatMode;
  readonly shuffle = this.player.shuffle;
  readonly speed = this.player.speed;
  readonly speeds = STORY_PLAYBACK_SPEEDS;
  readonly playerExpanded = signal(false);
  // Set when autoPlay=1 is in the URL. The template shows a pulsing play button
  // so the user knows playback is ready — they tap to start (browser policy requires
  // play() to be synchronous within a user gesture; we cannot call it after awaits).
  readonly autoPlayPending = signal(false);
  // Last audio-error seq we've toasted, so the effect fires once per failure.
  private lastAudioErrorSeq = 0;

  // ── Tap-on-word (delegated to StoryReaderInteractionService) ─────
  readonly tappedWord = this.interaction.tappedWord;
  readonly showConjugations = this.interaction.showConjugations;

  readonly tappedWordDetail = computed<WordDetail | null>(() => {
    const tw = this.tappedWord();
    const s = this.story();
    if (!tw || !s) return null;
    return this.wordSheet.resolveDetail(tw, s.keywords ?? [], s.vocabWords);
  });

  readonly tappedWordInVault = computed(() => {
    const wd = this.tappedWordDetail();
    return wd ? this.wordSheet.isInVault(wd) : false;
  });

  constructor() {
    addIcons({ arrowBackOutline, chevronBackOutline });
    this.destroyRef.onDestroy(() => this.player.teardown());

    // Mirror the player's active story into the page when it auto-advances
    // (autoplay-next happens inside StoryPlayerService, off the UI thread).
    // Only mirror once the page already shows a story — otherwise a stale
    // player.current() from a previous visit would clobber the story this page
    // is still loading in ngOnInit (and bind the play button to the wrong audio).
    // Writes page signals in response to the player's signal — an intentional
    // cross-signal sync, so allowSignalWrites is required and correct here.
    effect(() => {
      const cur = this.player.current();
      const shown = this.story();
      if (cur && shown && cur.id !== shown.id) {
        this.story.set(cur);
        this.isLearned.set(cur.isLearned ?? false);
        this.interaction.dismiss();
      }
    }, { allowSignalWrites: true });

    // When the player auto-skips a story whose audio failed to load (404 /
    // unsupported source), surface a toast. Keyed on the error seq so each
    // distinct failure shows once.
    effect(() => {
      const err = this.player.audioError();
      if (err && err.seq !== this.lastAudioErrorSeq) {
        this.lastAudioErrorSeq = err.seq;
        void this.showAudioErrorToast();
      }
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const autoPlay = this.route.snapshot.queryParamMap.get('autoPlay') === '1';

    const result = await this.loader.load(id, {
      onAudioGenerating: (v) => this.audioGenerating.set(v),
      onAudioLoading: (v) => this.audioLoading.set(v),
    });
    if (!result) {
      this.router.navigate(['/stories']);
      return;
    }

    const { story, hasAudio, needsEnrichment } = result;
    this.story.set(story);
    this.isLearned.set(story.isLearned ?? false);

    // Build the cross-story queue and hand the resolved audio to the player.
    // Set the current track first so playback is ready immediately; the queue
    // (used for next/prev/autoplay-next) fills in once the story list resolves.
    if (hasAudio && story.audioUrl) {
      this.player.setCurrent(story, story.audioUrl);
      if (autoPlay) await this.tryAutoPlay();
    }
    void this.player.initQueue(story.id);

    if (needsEnrichment) {
      void this.triggerEnrichment(story.id);
    }
  }

  private async triggerEnrichment(id: string): Promise<void> {
    this.enriching.set(true);
    try {
      const enriched = await this.storyStore.enrichStory(id);
      if (enriched) {
        // Preserve resolved audio URL — enrichment doesn't change audio
        const current = this.story();
        this.story.set({ ...enriched, audioUrl: current?.audioUrl ?? enriched.audioUrl });
      }
    } finally {
      this.enriching.set(false);
    }
  }

  /**
   * Fires on every entry, including when Ionic pops back to a cached instance of
   * this page (e.g. Replay → /stories/:id when we came from the same id). In that
   * case ngOnInit does NOT re-run, so we re-read the autoPlay param here and start
   * playback if the player already holds this story's audio. On the very first
   * load the audio isn't ready yet, so this no-ops and ngOnInit handles autoplay.
   */
  async ionViewWillEnter(): Promise<void> {
    const autoPlay = this.route.snapshot.queryParamMap.get('autoPlay') === '1';
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!autoPlay) return;
    // Only act on re-entry: player already has this exact story loaded & ready.
    if (this.player.current()?.id === id && !this.isPlaying()) {
      this.player.restart();
      await this.tryAutoPlay();
    }
  }

  ionViewWillLeave(): void {
    this.player.pause();
  }

  /**
   * Attempt to start playback for the loaded track. Strict browsers (desktop
   * Safari/Chrome) may reject play() outside a user gesture with NotAllowedError —
   * fall back to a pulsing play button. Native webviews allow it.
   */
  private async showAudioErrorToast(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('stories.reader.audioUnavailableToast'),
      duration: 2500,
      color: 'warning',
      position: 'bottom',
    });
    await toast.present();
  }

  private async tryAutoPlay(): Promise<void> {
    try {
      await this.player.play();
      this.autoPlayPending.set(false);
    } catch {
      this.autoPlayPending.set(true);
    }
  }

  setTab(tab: ReaderTab): void {
    if (tab !== 'story') this.player.pause();
    this.activeTab.set(tab);
  }

  // ── Player controls (delegated to StoryPlayerService) ────────────

  togglePlay(): void {
    this.autoPlayPending.set(false);
    this.player.togglePlay();
  }

  restart(): void {
    this.player.restart();
  }

  async nextTrack(): Promise<void> {
    await this.player.next(this.isPlaying());
  }

  async prevTrack(): Promise<void> {
    await this.player.prev();
  }

  cycleRepeat(): void {
    this.player.cycleRepeat();
  }

  toggleShuffle(): void {
    this.player.toggleShuffle();
  }

  setSpeed(speed: StoryPlaybackSpeed): void {
    this.player.setSpeed(speed);
  }

  expandPlayer(): void {
    this.playerExpanded.set(true);
  }

  collapsePlayer(): void {
    this.playerExpanded.set(false);
  }

  /** Up-Next queue rows for the expanded player. */
  readonly queueItems = computed(() => {
    const q = this.player.queue();
    const curIdx = this.player.queueIdx();
    return q.map((id, i) => {
      const s = this.storyStore.getById(id) ?? (id === this.story()?.id ? this.story() : null);
      const mins = s ? Math.max(1, Math.ceil(s.audioDurationMs / 60000)) : 0;
      return {
        id,
        title: s?.title ?? '…',
        level: s?.difficultyLevel ?? '',
        dur: `${mins} ${this.translate.instant('stories.cardMeta.min')}`,
        isCurrent: i === curIdx,
      };
    });
  });

  async playQueueItem(idx: number): Promise<void> {
    await this.player.loadIndex(idx, true);
  }

  currentTimeLabel(): string {
    return this.player.formatTime(this.player.currentTimeMs());
  }

  durationLabel(): string {
    const ms = this.player.durationMs() || this.story()?.audioDurationMs || 0;
    return this.player.formatTime(ms);
  }

  /** Manual completion — the only path to the Story Complete screen. */
  completeStory(): void {
    const s = this.story();
    if (!s) return;
    this.player.pause();
    this.playerExpanded.set(false);

    // Capture quiz result (if the user answered any questions) for the
    // Story Complete screen.
    const score = computeQuizScore(s.quizQuestions ?? [], this.quizAnswered());
    this.player.lastQuizScore.set(score.attempted ? score.correct : null);
    this.player.lastQuizTotal.set(score.total);

    this.storyStore.incrementListenCount(s.id);
    void this.router.navigate(['/stories', s.id, 'complete']);
  }

  readonly repeatModeLabel = computed(() => {
    switch (this.repeatMode()) {
      case 'all': return 'stories.reader.repeatQueue';
      case 'one': return 'stories.reader.repeatStory';
      default: return 'stories.reader.repeatOff';
    }
  });

  // ── Story Studio 2.0 reader helpers ──────────────────────────────

  private static readonly GRADIENTS = [
    'linear-gradient(140deg,#2E5547,#6E9C88)',
    'linear-gradient(140deg,#36544C,#86A99A)',
    'linear-gradient(145deg,#7C4A2E,#C2703D)',
    'linear-gradient(140deg,#22403A,#4E8C76)',
    'linear-gradient(140deg,#566A4E,#9DB08C)',
    'linear-gradient(145deg,#3E4F6B,#7D8FA8)',
  ];

  coverGradient(s: Story): string {
    const code = s.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
    return StoryReaderPage.GRADIENTS[code % StoryReaderPage.GRADIENTS.length];
  }

  readerMetaLine(s: Story): string {
    return `${s.difficultyLevel} · ${this.durationLabel()}`;
  }

  // ── Mark as learned ──────────────────────────────────────────────

  async toggleLearned(): Promise<void> {
    const s = this.story();
    if (!s) return;
    const newState = !this.isLearned();
    this.isLearned.set(newState);
    try {
      const updated = await firstValueFrom(this.api.markLearned(s.id, newState));
      this.story.set({ ...s, isLearned: updated.isLearned });
    } catch {
      this.isLearned.set(!newState); // revert on failure
    }
  }

  // ── Word sheet (delegated to StoryWordSheetService) ──────────────

  playTappedWord(): void {
    const wd = this.tappedWordDetail();
    if (wd) this.wordSheet.playDetail(wd);
  }

  async addToVault(): Promise<void> {
    const wd = this.tappedWordDetail();
    if (wd) await this.wordSheet.addToVault(wd);
  }

  /**
   * Open the shared word bottom sheet from a Keywords-tab row. The sheet renders
   * at the page root (over any tab), so we stay on the current tab rather than
   * jumping back to the Story tab.
   */
  openKeyword(keyword: StoryKeyword): void {
    this.interaction.openKeyword(keyword);
  }

  // ── Tap-on-word (from <lc-story-text>) ───────────────────────────

  onWordTap({ sentenceIdx, token }: StoryWordTap): void {
    this.interaction.tap(sentenceIdx, token);
  }

  dismissTappedWord(): void {
    this.interaction.dismiss();
  }

  // ── Navigation ───────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/stories']);
  }
}
