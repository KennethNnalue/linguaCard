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
import type { Story, StoryKeyword, StorySentence, VerbConjugations, WordTimestamp } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { ReviewStore } from '../../../review/store/review.store';
import { ReviewRoute } from '../../../review/models/review.model';
import { CardStore } from '../../../vault/store/card.store';
import { AiAudioCacheService } from '../../../ai/audio/ai-audio-cache.service';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { AssignCollectionSheetComponent } from '../../../vault/components/assign-collection-sheet/assign-collection-sheet.component';
import { QuizTabComponent } from '../../components/quiz-tab/quiz-tab.component';
import { KeywordsTabComponent } from '../../components/keywords-tab/keywords-tab.component';
import { GrammarTabComponent } from '../../components/grammar-tab/grammar-tab.component';
import { firstValueFrom } from 'rxjs';

export type ReaderTab = 'story' | 'quiz' | 'keywords' | 'grammar';

export interface WordToken {
  text: string;
  isVocab: boolean;
  wordIdx: number; // index within the sentence token array
}

export interface TappedWord {
  sentenceIdx: number;
  wordIdx: number;
  word: string;       // raw token text (may include punctuation)
  base: string;       // stripped form used for vocab lookup
  isVocab: boolean;
}

export interface WordDetail {
  display: string;        // "der Mensch" or "beraten"
  base: string;           // "Mensch"
  english: string;
  article: 'der' | 'die' | 'das' | null;
  wordType: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other' | null;
  plural: string | null;  // "die Menschen" — from vault card if available
  cardId: string | null;  // null if not in vault
  conjugations: VerbConjugations | null;
}

@Component({
  selector: 'lc-story-reader',
  templateUrl: './story-reader.page.html',
  styleUrls: ['./story-reader.page.scss'],
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
export class StoryReaderPage implements OnInit, OnDestroy, ViewWillLeave {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly cardStore = inject(CardStore);
  private readonly api = inject(StoryApiService);
  private readonly aiAudioCache = inject(AiAudioCacheService);
  private readonly wordAudio = inject(WordAudioService);
  private readonly authService = inject(AuthService);
  private readonly dedupService = inject(CardDedupService);
  private readonly modalCtrl = inject(ModalController);
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

  // ── Audio player ─────────────────────────────────────────────────
  readonly isPlaying = signal(false);
  readonly activeWordIdx = signal(-1);
  readonly speed = signal(1.0);
  readonly progressPct = signal(0);
  // Set when autoPlay=1 is in the URL. The template shows a pulsing play button
  // so the user knows playback is ready — they tap to start (browser policy requires
  // play() to be synchronous within a user gesture; we cannot call it after awaits).
  readonly autoPlayPending = signal(false);

  private audio: HTMLAudioElement | null = null;
  private timeupdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;

  readonly speeds = [0.5, 0.75, 1.0, 1.25, 1.5];
  readonly speedLabel = computed(() => `${this.speed()}×`);

  readonly words = computed<Array<WordTimestamp & { idx: number }>>(() => {
    const s = this.story();
    if (!s) return [];
    return s.wordTimestamps.map((w, i) => ({ ...w, idx: i }));
  });

  // ── Tap-on-word ──────────────────────────────────────────────────
  readonly tappedWord = signal<TappedWord | null>(null);
  readonly showConjugations = signal(false);

  readonly sentenceTokens = computed<WordToken[][]>(() => {
    const s = this.story();
    if (!s) return [];
    // Merge vocabWords + keywords so all highlighted words have a tap-detail entry
    const vocabBases = new Set([
      ...s.vocabWords.map(v => v.germanBase.toLowerCase()),
      ...(s.keywords ?? []).map(k => k.germanBase.toLowerCase()),
    ]);
    return s.sentences.map(sent => this.tokenise(sent, vocabBases));
  });

  readonly tappedWordDetail = computed<WordDetail | null>(() => {
    const tw = this.tappedWord();
    const s  = this.story();
    if (!tw || !s) return null;
    const base = tw.base.toLowerCase();

    // Try keywords first (have wordType + article)
    const keyword = (s.keywords ?? []).find(k => k.germanBase.toLowerCase() === base);
    if (keyword) {
      const card  = keyword.cardId ? this.cardStore.cards().find(c => c.id === keyword.cardId) : null;
      const plural = card?.content?.plural ?? null;
      return {
        display:      keyword.german,
        base:         keyword.germanBase,
        english:      keyword.english,
        article:      keyword.article,
        wordType:     keyword.wordType,
        plural,
        cardId:       keyword.cardId,
        conjugations: keyword.conjugations ?? null,
      };
    }

    // Fall back to vocabWords (no wordType)
    const vocab = s.vocabWords.find(v => v.germanBase.toLowerCase() === base);
    if (vocab) {
      const card  = this.cardStore.cards().find(c => c.id === vocab.cardId);
      const plural = card?.content?.plural ?? null;
      return {
        display:      vocab.german,
        base:         vocab.germanBase,
        english:      vocab.english,
        article:      vocab.article,
        wordType:     null,
        plural,
        cardId:       vocab.cardId,
        conjugations: null,
      };
    }

    // Unknown word — show raw token only
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

  constructor() {
    addIcons({ arrowBackOutline });
  }

  async ngOnInit(): Promise<void> {
    const autoPlay = this.route.snapshot.queryParamMap.get('autoPlay') === '1';
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    let s = this.storyStore.getById(id);
    if (!s) {
      try {
        s = await firstValueFrom(this.api.getById(id));
      } catch {
        this.router.navigate(['/stories']);
        return;
      }
    }

    // Initialise learned state from the story
    this.isLearned.set(s.isLearned ?? false);

    if (!s.audioUrl) {
      this.story.set(s);
      this.audioGenerating.set(true);
      const updated = await this.storyStore.generateAudio(s.id);
      this.audioGenerating.set(false);
      if (updated) {
        s = updated;
      } else {
        return;
      }
    }

    this.audioLoading.set(true);
    const resolvedUrl = await this.aiAudioCache.getOrDownload(s.id, s.audioUrl);
    this.audioLoading.set(false);

    this.story.set({ ...s, audioUrl: resolvedUrl });

    if (resolvedUrl) {
      this.initAudio(resolvedUrl, s.wordTimestamps);
      if (autoPlay) {
        // Cannot call audio.play() here — we're after multiple awaits, outside
        // any user gesture context. Browsers block programmatic play() in this state.
        // Signal the template to highlight the play button so the user taps to start.
        this.autoPlayPending.set(true);
      }
    }

    // Auto-enrich if quiz/keywords/grammar are missing and story has sentences
    const needsEnrichment =
      s.sentences?.length > 0 &&
      (
        (s.quizQuestions ?? []).length === 0 ||
        (s.grammarNotes ?? []).length === 0 ||
        (s.keywords ?? []).length === 0
      );

    if (needsEnrichment) {
      void this.triggerEnrichment(s.id);
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

  ionViewWillLeave(): void {
    this.pauseAudio();
  }

  ngOnDestroy(): void {
    this.destroyAudio();
  }

  setTab(tab: ReaderTab): void {
    if (tab !== 'story') this.pauseAudio();
    this.activeTab.set(tab);
  }

  private pauseAudio(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.isPlaying.set(false);
    }
  }

  private initAudio(url: string, timestamps: WordTimestamp[]): void {
    this.audio = new Audio(url);
    this.audio.playbackRate = this.speed();

    this.timeupdateHandler = () => {
      const ms = this.audio!.currentTime * 1000;
      const dur = this.audio!.duration * 1000 || 1;
      this.progressPct.set(Math.min(100, (ms / dur) * 100));
      const idx = timestamps.findIndex(w => ms >= w.startMs && ms < w.endMs);
      this.activeWordIdx.set(idx);
    };

    this.endedHandler = () => {
      this.isPlaying.set(false);
      this.activeWordIdx.set(-1);
      this.storyStore.incrementListenCount(this.story()!.id);
      void this.router.navigate(['/stories', this.story()!.id, 'complete']);
    };

    this.audio.addEventListener('timeupdate', this.timeupdateHandler);
    this.audio.addEventListener('ended', this.endedHandler);
  }

  private destroyAudio(): void {
    if (this.audio) {
      if (this.timeupdateHandler) this.audio.removeEventListener('timeupdate', this.timeupdateHandler);
      if (this.endedHandler) this.audio.removeEventListener('ended', this.endedHandler);
      this.audio.pause();
      this.audio = null;
    }
  }

  // ── Player controls ──────────────────────────────────────────────

  togglePlay(): void {
    if (!this.audio) return;
    this.autoPlayPending.set(false);
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
    const idx = this.speeds.indexOf(this.speed());
    const next = this.speeds[(idx + 1) % this.speeds.length];
    this.speed.set(next);
    if (this.audio) this.audio.playbackRate = next;
  }

  seekToPercent(event: MouseEvent): void {
    if (!this.audio || !this.audio.duration) return;
    const bar = event.currentTarget as HTMLElement;
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

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  isVocabActive(wt: WordTimestamp & { idx: number }): boolean {
    return wt.isVocab && wt.idx === this.activeWordIdx();
  }

  isActiveSentence(sentenceIndex: number): boolean {
    const wt = this.words()[this.activeWordIdx()];
    if (!wt) return false;
    const s = this.story();
    if (!s) return false;
    const sent = s.sentences[sentenceIndex];
    if (!sent) return false;
    return sent.german.includes(wt.word);
  }

  /**
   * Returns true if the given word timestamp belongs to the given sentence
   * by checking whether the word appears in that sentence's German text.
   * This works well for the karaoke rendering because timestamps are ordered.
   */
  isWordInSentence(wt: WordTimestamp & { idx: number }, sentenceIndex: number): boolean {
    const s = this.story();
    if (!s || !s.sentences[sentenceIndex]) return false;
    // Use sentence-boundary index ranges derived from cumulative word counts
    const sentenceWordMap = this.getSentenceWordRanges();
    const range = sentenceWordMap[sentenceIndex];
    if (!range) return false;
    return wt.idx >= range.start && wt.idx < range.end;
  }

  private getSentenceWordRanges(): Array<{ start: number; end: number }> {
    const s = this.story();
    if (!s) return [];
    const allWords = s.wordTimestamps;
    const ranges: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const sent of s.sentences) {
      const sentWords = sent.german.split(/\s+/).filter(Boolean);
      const start = cursor;
      const end = Math.min(cursor + sentWords.length, allWords.length);
      ranges.push({ start, end });
      cursor = end;
    }
    return ranges;
  }

  onAddToTraining(_keyword: StoryKeyword): void {
    // Intentionally empty — button removed from template
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

  // ── Keywords audio — persisted by cardId when in vault ───────────

  playTappedWord(): void {
    const wd = this.tappedWordDetail();
    if (!wd) return;
    const text = wd.article ? `${wd.article} ${wd.base}` : wd.base;
    void this.wordAudio.play(text, 'de-DE');
  }

  readonly tappedWordInVault = computed(() => {
    const wd = this.tappedWordDetail();
    if (!wd) return false;
    // Full-key check (article + base), then back-only fallback for verbs/adj without article
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

    // Ask user to pick a collection before creating
    const modal = await this.modalCtrl.create({
      component: AssignCollectionSheetComponent,
      componentProps: { selectedCollectionId: null, required: true },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ collectionId: string | null }>();
    if (!data?.collectionId) return; // user cancelled

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
        audioAssetId: null,
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
    // Build the text exactly as the vault does: "article back" (e.g. "die Fahrkarte").
    // This ensures the same normalised cache key is used whether the audio was
    // pre-generated via collection import or played from the vault.
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

  // ── Tap-on-word ──────────────────────────────────────────────────

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
      wordIdx:  token.wordIdx,
      word:     token.text,
      base:     this.stripPunctuation(token.text),
      isVocab:  token.isVocab,
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

  // ── Navigation ───────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/stories']);
  }

  // ── Private helpers ──────────────────────────────────────────────

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
