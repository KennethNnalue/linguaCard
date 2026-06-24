import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChildren,
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
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
  UserStoryProgress,
} from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { PlatformStoryLoaderService } from '../../services/platform-story-loader.service';
import { StoryAudioEngine } from '../../services/story-audio-engine.service';
import { StoryReaderInteractionService } from '../../services/story-reader-interaction.service';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { QuizTabComponent } from '../../components/quiz-tab/quiz-tab.component';
import { KeywordsTabComponent } from '../../components/keywords-tab/keywords-tab.component';
import { GrammarTabComponent } from '../../components/grammar-tab/grammar-tab.component';
import { StoryWordSheetService } from '../../services/story-word-sheet.service';
import { StoryTokenizerService } from '../../services/story-tokenizer.service';
import type { ReaderTab, WordDetail, WordToken } from '../../models/reader.model';

const PLATFORM_SPEEDS = [0.75, 0.95, 1.0, 1.25, 1.5];

@Component({
  selector: 'lc-platform-story-reader',
  templateUrl: './platform-story-reader.page.html',
  styleUrls: ['./platform-story-reader.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StoryAudioEngine, StoryReaderInteractionService],
  imports: [
    IonContent,
    IonIcon,
    TitleCasePipe,
    TranslatePipe,
    QuizTabComponent,
    KeywordsTabComponent,
    GrammarTabComponent,
  ],
})
export class PlatformStoryReaderPage implements OnInit, ViewWillLeave {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loader = inject(PlatformStoryLoaderService);
  private readonly engine = inject(StoryAudioEngine);
  private readonly interaction = inject(StoryReaderInteractionService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly wordSheet = inject(StoryWordSheetService);
  private readonly tokenizer = inject(StoryTokenizerService);

  readonly story = signal<PlatformStory | null>(null);
  readonly progress = signal<UserStoryProgress | null>(null);
  readonly isLoading = signal(false);

  readonly activeTab = signal<ReaderTab>('story');
  readonly showTranslation = signal(false);

  readonly quizCurrentIdx = signal(0);
  readonly quizAnswered = signal<Record<string, string>>({});

  readonly pronunciationLoading = computed(() => this.wordAudio.isLoading());

  // ── Tap-on-word (delegated to StoryReaderInteractionService) ─────
  readonly tappedWord = this.interaction.tappedWord;
  readonly showConjugations = this.interaction.showConjugations;

  readonly sentenceTokens = computed<WordToken[][]>(() => {
    const s = this.story();
    if (!s) return [];
    const vocabBases = new Set(s.keywords.map(k => k.germanBase.toLowerCase()));
    return s.sentences.map(sent => this.tokenizer.tokenise(sent, vocabBases));
  });

  readonly tappedWordDetail = computed<WordDetail | null>(() => {
    const tw = this.tappedWord();
    const s = this.story();
    if (!tw || !s) return null;
    return this.wordSheet.resolveDetail(tw, s.keywords);
  });

  readonly tappedWordInVault = computed(() => {
    const wd = this.tappedWordDetail();
    return wd ? this.wordSheet.isInVault(wd) : false;
  });

  // ── Audio player (delegated to StoryAudioEngine) ─────────────────
  readonly isPlaying = this.engine.playing;
  readonly activeWordIdx = this.engine.activeWordIdx;
  readonly activeSentenceIdx = this.engine.activeSentenceIdx;
  readonly progressPct = this.engine.progressPct;
  readonly speed = signal(0.95);

  readonly speeds = PLATFORM_SPEEDS;
  readonly speedLabel = computed(() => `${this.speed()}×`);

  readonly categoryLabel = computed(() => {
    const s = this.story();
    if (!s) return '';
    return STORY_CATEGORIES.find(c => c.value === s.category)?.label ?? s.category;
  });

  /** Rendered sentence blocks, used to scroll the active one into view. */
  private readonly sentenceEls = viewChildren<ElementRef<HTMLElement>>('sentence');

  constructor() {
    addIcons({ arrowBackOutline });
    this.engine.setSpeed(this.speed());
    this.destroyRef.onDestroy(() => this.engine.teardown());

    // Keep the spoken sentence centred during playback (follow-along scroll).
    effect(() => {
      const idx = this.activeSentenceIdx();
      if (idx < 0) return;
      const el = this.sentenceEls()[idx]?.nativeElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const autoPlay = this.route.snapshot.queryParamMap.get('autoPlay') === '1';
    this.isLoading.set(true);

    const result = await this.loader.load(id);
    this.isLoading.set(false);
    if (!result) {
      this.router.navigate(['/stories']);
      return;
    }

    this.story.set(result.story);
    this.progress.set(result.progress);

    const { audioUrl, wordTimestamps, audioDurationMs, sentences } = result.story;
    if (audioUrl) {
      this.engine.load({
        url: audioUrl,
        timestamps: wordTimestamps,
        sentencePlan: this.tokenizer.computeSentencePlan(
          sentences,
          audioDurationMs,
          wordTimestamps,
        ),
        durationMs: audioDurationMs,
      });
      if (autoPlay) {
        // Native webviews allow this; strict browsers reject play() outside a
        // gesture — ignore the rejection (the user can tap the play pill).
        try { await this.engine.play(); } catch { /* autoplay blocked — leave paused */ }
      }
    }
  }

  ionViewWillLeave(): void {
    this.engine.pause();
  }

  setTab(tab: ReaderTab): void {
    if (tab !== 'story') this.engine.pause();
    this.activeTab.set(tab);
  }

  toggleTranslation(): void {
    this.showTranslation.update(v => !v);
  }

  toggleConjugations(): void {
    this.interaction.toggleConjugations();
  }

  // ── Player controls (delegated to StoryAudioEngine) ──────────────

  togglePlay(): void {
    this.engine.togglePlay();
  }

  restart(): void {
    this.engine.restart();
  }

  cycleSpeed(): void {
    const idx = this.speeds.indexOf(this.speed());
    const next = this.speeds[(idx + 1) % this.speeds.length];
    this.speed.set(next);
    this.engine.setSpeed(next);
  }

  currentTimeLabel(): string {
    return this.engine.formatTime(this.engine.currentTimeMs());
  }

  durationLabel(): string {
    const ms = this.engine.durationMs() || this.story()?.audioDurationMs || 0;
    return this.engine.formatTime(ms);
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

  /** Open the word sheet from a Keywords-tab row. */
  openKeyword(keyword: StoryKeyword): void {
    this.activeTab.set('story');
    this.interaction.openKeyword(keyword);
  }

  tapWord(sentenceIdx: number, token: WordToken): void {
    this.interaction.tap(sentenceIdx, token);
  }

  dismissTappedWord(): void {
    this.interaction.dismiss();
  }

  isWordActive(sentenceIdx: number, wordIdx: number): boolean {
    return this.interaction.isWordActive(sentenceIdx, wordIdx);
  }

  /** Sentence-level karaoke: the sentence currently being spoken. */
  isSentenceActive(sentenceIdx: number): boolean {
    return this.activeSentenceIdx() === sentenceIdx;
  }

  goBack(): void {
    this.router.navigate(['/stories']);
  }
}
