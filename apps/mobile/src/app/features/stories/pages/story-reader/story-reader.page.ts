import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, playOutline, pauseOutline, playSkipBackOutline, repeatOutline } from 'ionicons/icons';
import type { Story, StoryKeyword, WordTimestamp } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { AiAudioCacheService } from '../../../ai/audio/ai-audio-cache.service';
import { PronunciationService } from '../../../ai/audio/pronunciation.service';
import { QuizTabComponent } from '../../components/quiz-tab/quiz-tab.component';
import { KeywordsTabComponent } from '../../components/keywords-tab/keywords-tab.component';
import { GrammarTabComponent } from '../../components/grammar-tab/grammar-tab.component';
import { firstValueFrom } from 'rxjs';

export type ReaderTab = 'story' | 'quiz' | 'keywords' | 'grammar';

@Component({
  selector: 'app-story-reader',
  templateUrl: './story-reader.page.html',
  styleUrls: ['./story-reader.page.scss'],
  imports: [
    IonContent,
    IonIcon,
    NgClass,
    QuizTabComponent,
    KeywordsTabComponent,
    GrammarTabComponent,
  ],
})
export class StoryReaderPage implements OnInit, OnDestroy {
  @ViewChild('audioEl') audioElRef!: ElementRef<HTMLAudioElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);
  private readonly aiAudioCache = inject(AiAudioCacheService);
  private readonly pronunciation = inject(PronunciationService);

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

  // ── Pronunciation loading (forwarded from PronunciationService) ──
  readonly pronunciationLoading = computed(() => this.pronunciation.isLoading());

  // ── Audio player ─────────────────────────────────────────────────
  readonly isPlaying = signal(false);
  readonly activeWordIdx = signal(-1);
  readonly speed = signal(1.0);
  readonly progressPct = signal(0);

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

  constructor() {
    addIcons({ arrowBackOutline, playOutline, pauseOutline, playSkipBackOutline, repeatOutline });
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
        void this.audio?.play();
        this.isPlaying.set(true);
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

  ngOnDestroy(): void {
    this.destroyAudio();
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

  onAddToTraining(keyword: StoryKeyword): void {
    // Navigate to vault with pre-filter, or no-op for now
    if (keyword.cardId) {
      void this.router.navigate(['/vault'], { queryParams: { highlight: keyword.cardId } });
    }
  }

  onMemorizeAll(): void {
    const s = this.story();
    if (!s) return;
    const cardIds = (s.keywords ?? [])
      .map(k => k.cardId)
      .filter((id): id is string => !!id);
    if (cardIds.length > 0) {
      void this.router.navigate(['/review'], { queryParams: { cardIds: cardIds.join(',') } });
    }
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

  // ── Quiz audio — on-demand AI TTS for the full sentence ──────────

  onQuizPlayAudio(sentence: string): void {
    // Quiz sentences are story-specific — generate on-demand via /ai/tts
    // (no cardId → ephemeral object URL, no persistence needed)
    void this.pronunciation.playText(sentence, 'de-DE');
  }

  // ── Keywords audio — persisted by cardId when in vault ───────────

  onKeywordsPlayWord(keyword: StoryKeyword): void {
    // Use the full form with article when available (e.g. "der Sternenhimmel")
    const text = keyword.german || keyword.germanBase;
    // cardId present → persisted to R2 as pronunciation/{cardId}.wav and reused
    // cardId absent  → on-demand /ai/tts ephemeral object URL
    void this.pronunciation.playText(text, 'de-DE', keyword.cardId ?? undefined);
  }

  // ── Navigation ───────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/stories']);
  }
}
