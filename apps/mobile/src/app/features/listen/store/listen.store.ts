import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { Card, ConfidenceRating } from '@lingua-card/shared/domain';
import { CardApiService } from '../../vault/services/card-api.service';
import { AudioService } from '../../../shared/audio/audio.service';
import { PronunciationService } from '../../ai/audio/pronunciation.service';
import { Sm2Service } from '../../../shared/srs/sm2.service';

type PlaylistMode = 'word-meaning' | 'examples-only' | 'deep-dive';

@Injectable({ providedIn: 'root' })
export class ListenStore {
  private readonly cardApi = inject(CardApiService);
  private readonly audio = inject(AudioService);
  private readonly injector = inject(Injector);
  private readonly sm2 = inject(Sm2Service);

  // Lazy getter breaks the root-injector initialization cycle: both ListenStore
  // and PronunciationService are providedIn:'root', so eagerly injecting one
  // inside the other's constructor triggers NG0200. Deferring to first use
  // (after both are fully constructed) resolves the cycle.
  private _pronunciation: PronunciationService | null = null;
  private get pronunciation(): PronunciationService {
    if (!this._pronunciation) {
      this._pronunciation = this.injector.get(PronunciationService);
    }
    return this._pronunciation;
  }

  private readonly _queue = signal<Card[]>([]);
  private readonly _currentIndex = signal(0);
  private readonly _isPlaying = signal(false);
  private readonly _playbackMode = signal<PlaylistMode>('word-meaning');
  private readonly _playbackSpeed = signal<number>(1.0);
  private readonly _isShuffled = signal(false);
  private readonly _activeSourceLabel = signal("Today's due words");
  private readonly _ratingWindowVisible = signal(false);
  private readonly _ratingCountdown = signal(3);

  private _playbackCancelled = false;
  private _playbackEpoch = 0;
  private _ratingTimer: ReturnType<typeof setTimeout> | null = null;

  readonly queue = this._queue.asReadonly();
  readonly currentIndex = this._currentIndex.asReadonly();
  readonly isPlaying = this._isPlaying.asReadonly();
  readonly playbackMode = this._playbackMode.asReadonly();
  readonly playbackSpeed = this._playbackSpeed.asReadonly();
  readonly isShuffled = this._isShuffled.asReadonly();
  readonly activeSourceLabel = this._activeSourceLabel.asReadonly();
  readonly ratingWindowVisible = this._ratingWindowVisible.asReadonly();
  readonly ratingCountdown = this._ratingCountdown.asReadonly();

  readonly currentCard = computed<Card | null>(() => {
    const q = this._queue();
    const i = this._currentIndex();
    return q.length > 0 ? (q[i] ?? null) : null;
  });

  loadPlaylist(cards: Card[], label: string): void {
    this.pause();
    this._queue.set([...cards]);
    this._currentIndex.set(0);
    this._activeSourceLabel.set(label);
  }

  play(): void {
    if (this._isPlaying()) return;
    this._playbackCancelled = false;
    this._playbackEpoch++;
    this._isPlaying.set(true);
    this._playCurrentCard(this._playbackEpoch);
  }

  pause(): void {
    this._playbackCancelled = true;
    this._isPlaying.set(false);
    this.audio.stop();
    this._clearRatingTimer();
    this._ratingWindowVisible.set(false);
  }

  togglePlay(): void {
    if (this._isPlaying()) this.pause();
    else this.play();
  }

  next(): void {
    const wasPlaying = this._isPlaying();
    this.pause();
    const next = this._currentIndex() + 1;
    if (next < this._queue().length) {
      this._currentIndex.set(next);
      if (wasPlaying) this.play();
    }
  }

  prev(): void {
    const wasPlaying = this._isPlaying();
    this.pause();
    const prev = this._currentIndex() - 1;
    if (prev >= 0) {
      this._currentIndex.set(prev);
      if (wasPlaying) this.play();
    }
  }

  seekTo(index: number): void {
    const wasPlaying = this._isPlaying();
    this.pause();
    this._currentIndex.set(index);
    if (wasPlaying) this.play();
  }

  setMode(mode: PlaylistMode): void {
    this._playbackMode.set(mode);
  }

  setSpeed(speed: number): void {
    this._playbackSpeed.set(speed);
  }

  toggleShuffle(): void {
    const enabling = !this._isShuffled();
    this._isShuffled.set(enabling);
    if (enabling) {
      const current = this.currentCard();
      const q = [...this._queue()];
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      this._queue.set(q);
      if (current) {
        const newIdx = q.findIndex(c => c.id === current.id);
        this._currentIndex.set(newIdx >= 0 ? newIdx : 0);
      }
    }
  }

  rateCurrentCard(rating: ConfidenceRating): void {
    const epoch = this._playbackEpoch;
    this._ratingWindowVisible.set(false);
    this._clearRatingTimer();
    const card = this.currentCard();
    if (card) {
      const existingSrs = card.srsState ?? this.sm2.freshState(card.id, card.userId);
      const newSrs = this.sm2.compute(existingSrs, rating);
      this.cardApi.update(card.id, { srsState: newSrs, updatedAt: new Date().toISOString() }).subscribe();
    }
    this._advanceOrComplete(epoch);
  }

  dismissRating(): void {
    const epoch = this._playbackEpoch;
    this._ratingWindowVisible.set(false);
    this._clearRatingTimer();
    this._advanceOrComplete(epoch);
  }

  private async _playCurrentCard(epoch: number): Promise<void> {
    const card = this.currentCard();
    if (!card || this._playbackCancelled || epoch !== this._playbackEpoch) {
      this._isPlaying.set(false);
      return;
    }
    const utterances = this._buildUtterances(card, this._playbackMode());
    for (const utt of utterances) {
      if (this._playbackCancelled || epoch !== this._playbackEpoch) return;
      await this._speakPromise(utt.text, utt.lang, this._playbackSpeed(), utt.cardId);
      if (utt.pause && !this._playbackCancelled && epoch === this._playbackEpoch) {
        await this._sleep(utt.pause);
      }
    }
    if (!this._playbackCancelled && epoch === this._playbackEpoch) {
      this._showRatingWindow(epoch);
    }
  }

  private _buildUtterances(card: Card, mode: PlaylistMode): { text: string; lang: string; pause?: number; cardId?: string }[] {
    const article = card.content.article ?? '';
    const word = card.content.back;
    const articleWord = article ? `${article} ${word}` : word;
    const translation = card.content.front;
    const example = card.content.examples[0];

    if (mode === 'word-meaning') {
      return [
        { text: articleWord, lang: 'de-DE', pause: 800, cardId: card.id },
        { text: translation, lang: 'en-US', pause: 1200 },
      ];
    }
    if (mode === 'examples-only') {
      const items: { text: string; lang: string; pause?: number; cardId?: string }[] = [
        { text: word, lang: 'de-DE', pause: 600, cardId: card.id },
      ];
      if (example) {
        items.push({ text: example.target, lang: 'de-DE', pause: 800 });
        items.push({ text: example.native, lang: 'en-US', pause: 1200 });
      }
      return items;
    }
    // deep-dive
    const items: { text: string; lang: string; pause?: number; cardId?: string }[] = [
      { text: articleWord, lang: 'de-DE', pause: 600, cardId: card.id },
      { text: translation, lang: 'en-US', pause: 600 },
    ];
    if (example) {
      items.push({ text: example.target, lang: 'de-DE', pause: 800 });
      items.push({ text: example.native, lang: 'en-US', pause: 800 });
    }
    if (card.content.notes) {
      items.push({ text: card.content.notes, lang: 'en-US', pause: 1200 });
    }
    return items;
  }

  private _speakPromise(text: string, lang: string, _rate: number, cardId?: string): Promise<void> {
    if (lang === 'de-DE') {
      return this.pronunciation.playTextAsPromise(text, 'de-DE', cardId);
    }
    return new Promise(resolve => {
      this.audio.speak(text, lang, _rate).subscribe({
        next: () => resolve(),
        error: () => resolve(),
        complete: () => resolve(),
      });
    });
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private _showRatingWindow(epoch: number): void {
    this._ratingWindowVisible.set(true);
    this._ratingCountdown.set(3);
    const tick = () => {
      if (epoch !== this._playbackEpoch) return;
      const current = this._ratingCountdown();
      if (current <= 1) {
        this._ratingWindowVisible.set(false);
        this._advanceOrComplete(epoch);
      } else {
        this._ratingCountdown.set(current - 1);
        this._ratingTimer = setTimeout(tick, 1000);
      }
    };
    this._ratingTimer = setTimeout(tick, 1000);
  }

  private _clearRatingTimer(): void {
    if (this._ratingTimer !== null) {
      clearTimeout(this._ratingTimer);
      this._ratingTimer = null;
    }
  }

  private _advanceOrComplete(epoch: number): void {
    if (epoch !== this._playbackEpoch) return;
    const next = this._currentIndex() + 1;
    if (next >= this._queue().length) {
      this._isPlaying.set(false);
      this._currentIndex.set(0);
    } else {
      this._currentIndex.set(next);
      if (this._isPlaying()) {
        setTimeout(() => this._playCurrentCard(epoch), 500);
      }
    }
  }

}
