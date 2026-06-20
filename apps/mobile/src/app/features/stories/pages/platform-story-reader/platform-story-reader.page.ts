import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { NgClass, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  ModalController,
  ToastController,
  ViewWillLeave,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import type {
  PlatformStory,
  StoryKeyword,
  StorySentence,
  VerbConjugations,
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
import { AuthService } from '../../../../core/services/auth.service';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { AssignCollectionSheetComponent } from '../../../vault/components/assign-collection-sheet/assign-collection-sheet.component';
import type { TappedWord, WordDetail, WordToken } from '../story-reader/story-reader.page';

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
    TitleCasePipe,
    QuizTabComponent,
    KeywordsTabComponent,
    GrammarTabComponent,
  ],
})
export class PlatformStoryReaderPage implements OnInit, OnDestroy, ViewWillLeave {
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly api         = inject(PlatformStoryApiService);
  private readonly reviewStore  = inject(ReviewStore);
  private readonly cardStore    = inject(CardStore);
  private readonly wordAudio    = inject(WordAudioService);
  private readonly authService       = inject(AuthService);
  private readonly dedupService      = inject(CardDedupService);
  private readonly modalCtrl         = inject(ModalController);
  private readonly toastCtrl         = inject(ToastController);

  readonly story    = signal<PlatformStory | null>(null);
  readonly progress = signal<UserStoryProgress | null>(null);
  readonly isLoading = signal(false);

  readonly activeTab = signal<PlatformReaderTab>('story');
  readonly showTranslation = signal(false);

  readonly quizCurrentIdx = signal(0);
  readonly quizAnswered   = signal<Record<string, string>>({});

  readonly pronunciationLoading = computed(() => this.wordAudio.isLoading());

  // ── Tap-on-word ──────────────────────────────────────────────────
  readonly tappedWord = signal<TappedWord | null>(null);
  readonly showConjugations = signal(false);

  readonly sentenceTokens = computed<WordToken[][]>(() => {
    const s = this.story();
    if (!s) return [];
    const vocabBases = new Set(s.keywords.map(k => k.germanBase.toLowerCase()));
    return s.sentences.map(sent => this.tokenise(sent, vocabBases));
  });

  readonly tappedWordDetail = computed<WordDetail | null>(() => {
    const tw = this.tappedWord();
    const s  = this.story();
    if (!tw || !s) return null;
    const base = tw.base.toLowerCase();

    const keyword = s.keywords.find(k => k.germanBase.toLowerCase() === base);
    if (keyword) {
      const card = keyword.cardId ? this.cardStore.cards().find(c => c.id === keyword.cardId) : null;
      return {
        display:      keyword.german,
        base:         keyword.germanBase,
        english:      keyword.translation,
        article:      keyword.article,
        wordType:     keyword.wordType,
        plural:       card?.content?.plural ?? null,
        cardId:       keyword.cardId,
        conjugations: keyword.conjugations ?? null,
      };
    }

    return {
      display:      tw.base,
      base:         tw.base,
      english:      '',
      article:      null,
      wordType:     null,
      plural:       null,
      cardId:       null,
      conjugations: null,
    };
  });

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

  playTappedWord(): void {
    const wd = this.tappedWordDetail();
    if (!wd) return;
    const text = wd.article ? `${wd.article} ${wd.base}` : wd.base;
    void this.wordAudio.play(text, 'de-DE');
  }

  readonly tappedWordInVault = computed(() => {
    const wd = this.tappedWordDetail();
    if (!wd) return false;
    return !!(
      this.dedupService.check(wd.article, wd.base) ??
      this.dedupService.checkByBackOnly(wd.base)
    );
  });

  async addToVault(): Promise<void> {
    const wd = this.tappedWordDetail();
    if (!wd) return;

    if (this.tappedWordInVault()) {
      const toast = await this.toastCtrl.create({
        message: 'Already in your vault',
        duration: 2000,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();
      return;
    }

    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      componentProps: { selectedCollectionId: null, required: true },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ collectionId: string | null }>();
    if (!data?.collectionId) return;

    const collectionId = data.collectionId;
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date().toISOString();
    const genderMap: Record<string, 'masculine' | 'feminine' | 'neuter'> = {
      der: 'masculine', die: 'feminine', das: 'neuter',
    };
    const gender = wd.article ? (genderMap[wd.article] ?? null) : null;

    this.cardStore.createCard({
      deckId: 'deck-001',
      collectionId,
      userId,
      contextId: 'german-vocab',
      content: {
        front: wd.display,
        back: wd.english || wd.display,
        article: wd.article,
        gender,
        plural: wd.plural,
        examples: [],
        synonyms: [],
        notes: '',
        imageUrl: null,
        phonetic: null,
      },
      categoryIds: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      srsState: {
        id: crypto.randomUUID(),
        cardId: '',
        userId,
        algorithm: 'fsrs',
        intervalDays: 1,
        easeFactor: 2.5,
        repetitions: 0,
        lastRating: null,
        lastReviewedAt: null,
        nextDueAt: now,
        masteryLevel: 0,
        state: 'new',
        stability: null,
        difficulty: null,
        retrievability: null,
      },
    }).subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: `"${wd.display}" added to vault`,
          duration: 2000,
          position: 'bottom',
          color: 'success',
        });
        await toast.present();
      },
      error: async () => {
        const toast = await this.toastCtrl.create({
          message: 'Failed to save word — please try again',
          duration: 3000,
          position: 'bottom',
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

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

  tapWord(sentenceIdx: number, token: WordToken): void {
    const current = this.tappedWord();
    if (current?.sentenceIdx === sentenceIdx && current.wordIdx === token.wordIdx) {
      this.tappedWord.set(null);
      this.showConjugations.set(false);
      return;
    }
    this.showConjugations.set(false);
    this.tappedWord.set({
      sentenceIdx,
      wordIdx: token.wordIdx,
      word:    token.text,
      base:    this.stripPunctuation(token.text),
      isVocab: token.isVocab,
    });
  }

  dismissTappedWord(): void {
    this.tappedWord.set(null);
    this.showConjugations.set(false);
  }

  isWordActive(sentenceIdx: number, wordIdx: number): boolean {
    const t = this.tappedWord();
    return t?.sentenceIdx === sentenceIdx && t.wordIdx === wordIdx;
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

  private tokenise(sent: StorySentence, vocabBases: Set<string>): WordToken[] {
    return sent.german.split(/(\s+)/).filter(t => t.trim().length > 0).map((text, wordIdx) => ({
      text,
      wordIdx,
      isVocab: vocabBases.has(this.stripPunctuation(text).toLowerCase()),
    }));
  }

  private stripPunctuation(word: string): string {
    return word.replace(/^[«"'„]+|[»"'.,!?;:]+$/g, '');
  }
}
