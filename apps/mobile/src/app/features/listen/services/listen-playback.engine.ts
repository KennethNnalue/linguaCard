import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, from, map, Subject, timer } from 'rxjs';
import {
  AudioSegment,
  Card,
  PlaybackScript,
  PlayerSettings,
  PlayerStatus,
} from '@lingua-card/shared/domain';
import { WordAudioService } from '../../../shared/audio/word-audio.service';
import { LISTEN_PREFETCH_WINDOW, ListenState, OfflineDownloadStatus, SilenceDuration } from '../models/listen.models';

interface TaggedSegment {
  segment: AudioSegment;
  generation: number;
}

/**
 * State backend the engine reads from / writes to. The ListenStore supplies an
 * adapter wrapping its signals + patchState, so the engine never imports the
 * store (no circular dependency) and stays a focused audio sequencer.
 */
export interface PlaybackHost {
  currentScript: () => PlaybackScript | null;
  currentSegment: () => AudioSegment | null;
  status: () => PlayerStatus;
  settings: () => PlayerSettings;
  queue: () => Card[];
  cardIndex: () => number;
  segmentIndex: () => number;
  downloadStatus: () => OfflineDownloadStatus;
  patch: (state: Partial<ListenState>) => void;
  saveSession: () => void;
}

/**
 * Owns the Listen playback sequence: the cancellable segment pipeline, the
 * generation counter that keeps it correct across navigation, windowed audio
 * prefetch, and the playback transport (start/next/previous/pause/resume/skip/
 * retry). The ListenStore owns queue/source state and delegates control here.
 *
 * ── Why the generation counter ──────────────────────────────────────────────
 * concatMap queues inner observables — it never cancels the in-flight one when
 * a new emission arrives. Tapping Next mid-word would otherwise:
 *   1. leave the current playTarget() running (Audio has no cancel handle),
 *   2. queue a new segment behind it, and
 *   3. when the stale audio finally resolves, advance the *already-advanced*
 *      state again, playing segments from the new card out of order.
 * Every transport call that starts a new sequence bumps `generation`. Each
 * emission carries the generation at emit time; the subscriber ignores any
 * completion whose generation no longer matches. The Subject is also drained and
 * replaced on each navigation so no stale segment ever starts after a skip.
 */
@Injectable({ providedIn: 'root' })
export class ListenPlaybackEngine {
  private readonly wordAudio = inject(WordAudioService);
  private readonly destroyRef = inject(DestroyRef);

  private host!: PlaybackHost;
  private generation = 0;
  private subject$ = new Subject<TaggedSegment>();
  private readonly prefetchedIndices = new Set<number>();

  /** Wire the engine to the store's state. Called once on store init. */
  attach(host: PlaybackHost): void {
    this.host = host;
    this.subscribeRunner(this.subject$);
  }

  // ── Transport ───────────────────────────────────────────────────────────────

  /**
   * Abort any in-flight audio, rebuild the pipeline, and play from the current
   * segment. Used by start / skip-into / restart — the caller sets queue + status
   * first, then calls this.
   */
  restart(): void {
    const gen = this.abort();
    this.resetPipeline();
    this.emitCurrent(gen);
  }

  pause(): void {
    // Silence the current word immediately AND invalidate any in-flight segment
    // completion (generation bump) so a late-resolving promise can't advance the
    // queue while paused.
    this.abort();
    this.host.patch({ status: 'paused' });
  }

  resume(): void {
    if (this.host.status() !== 'paused') return;
    this.host.patch({ status: 'playing', errorMessage: null });
    // Fresh pipeline, then replay the current segment from its start. The engine
    // has no mid-segment resume, so replaying the current word is predictable.
    this.resetPipeline();
    this.emitCurrent(this.generation);
  }

  next(): void {
    const idx = this.host.cardIndex();
    if (idx >= this.host.queue().length - 1) return;
    const wasPlaying = this.host.status() === 'playing';
    const gen = this.abort();
    this.host.patch({ cardIndex: idx + 1, segmentIndex: 0 });
    this.host.saveSession();
    this.prefetchWindow(idx + 1);
    if (wasPlaying) {
      this.resetPipeline();
      this.emitCurrent(gen);
    }
  }

  previous(): void {
    const idx = this.host.cardIndex();
    if (idx <= 0) return;
    const wasPlaying = this.host.status() === 'playing';
    const gen = this.abort();
    this.host.patch({ cardIndex: idx - 1, segmentIndex: 0 });
    this.host.saveSession();
    this.prefetchWindow(idx - 1);
    if (wasPlaying) {
      this.resetPipeline();
      this.emitCurrent(gen);
    }
  }

  skipCard(): void {
    const idx = this.host.cardIndex();
    if (idx >= this.host.queue().length - 1) {
      this.abort();
      this.host.patch({ status: 'complete' });
      return;
    }
    const gen = this.abort();
    this.host.patch({ cardIndex: idx + 1, segmentIndex: 0, status: 'playing', errorMessage: null });
    this.prefetchWindow(idx + 1);
    this.resetPipeline();
    this.emitCurrent(gen);
  }

  retrySegment(): void {
    const gen = this.abort();
    this.host.patch({ status: 'playing', errorMessage: null });
    this.resetPipeline();
    this.emitCurrent(gen);
  }

  /** Stop audio + invalidate the in-flight segment without restarting (loadQueue / resetToIdle). */
  abortPlayback(): void {
    this.abort();
  }

  /** Stop all audio without touching generation/state. */
  stopAudio(): void {
    this.wordAudio.stop();
  }

  // ── Prefetch ──────────────────────────────────────────────────────────────
  // Pre-warm TARGET-language audio for a sliding window of upcoming cards only —
  // never the whole queue — so we don't generate audio for cards never reached.
  // Native audio is Web Speech (not prefetched). Cleared when the queue rebuilds.

  resetPrefetch(): void {
    this.prefetchedIndices.clear();
  }

  /**
   * Target-language audio items actually played for a card under the current
   * mode: the headword always; the first example only in examples/deepDive (in
   * compact mode the example is never spoken, so warming it would waste TTS).
   */
  targetItemsForCard(c: Card): { text: string; language: string }[] {
    const word = c.content.article ? `${c.content.article} ${c.content.back}` : c.content.back;
    const items = [{ text: word, language: 'de-DE' }];
    if (this.host.settings().playMode !== 'compact') {
      const ex = c.content.examples?.[0];
      if (ex?.target) items.push({ text: ex.target, language: 'de-DE' });
    }
    return items;
  }

  /** Fire-and-forget warm of the sliding window ahead of the cursor. */
  prefetchWindow(startIdx: number): void {
    const items = this._collectWindowItems(startIdx);
    if (items.length) void this.wordAudio.preWarm(items);
  }

  /**
   * AWAITED warm of the first window — used by start() to gate playback so the
   * opening cards never fall back to a robotic voice or a silent beat. The store
   * shows a "preparing" state while this resolves. Per-segment HD resolution is
   * still the safety net for anything that slips past the window.
   */
  async prepareWindow(startIdx: number): Promise<void> {
    const items = this._collectWindowItems(startIdx);
    if (items.length) await this.wordAudio.preWarm(items);
  }

  /** Collect (and mark) the un-warmed target items for the window at startIdx. */
  private _collectWindowItems(startIdx: number): { text: string; language: string }[] {
    const queue = this.host.queue();
    const end = Math.min(queue.length, Math.max(0, startIdx) + LISTEN_PREFETCH_WINDOW);
    const items: { text: string; language: string }[] = [];
    for (let i = Math.max(0, startIdx); i < end; i++) {
      if (this.prefetchedIndices.has(i)) continue;
      this.prefetchedIndices.add(i);
      const c = queue[i];
      if (!c) continue;
      items.push(...this.targetItemsForCard(c));
    }
    return items;
  }

  /**
   * How long to hold a (silent) native-translation segment on screen, scaled by
   * text length and the current playback speed. Clamped so very short or very
   * long translations stay within a comfortable reading window.
   */
  private nativeReadMs(text: string, rate: number): number {
    const base = 600 + text.length * 45;
    return Math.round(Math.min(4000, Math.max(900, base)) / Math.max(0.5, rate));
  }

  /**
   * Download the whole queue's TARGET-language audio to the device for offline
   * playback. Reuses the cache-first preWarm (persists to the device). Native
   * audio stays Web Speech (already offline). Downloads exactly what the current
   * mode plays, so example audio isn't fetched in compact mode.
   */
  async downloadQueueForOffline(): Promise<void> {
    if (this.host.downloadStatus() === 'downloading') return;
    const queue = this.host.queue();
    if (!queue.length) return;

    this.host.patch({ downloadStatus: 'downloading' });
    const items = queue.flatMap(c => this.targetItemsForCard(c));
    try {
      await this.wordAudio.preWarm(items);
      // The whole queue is now warm — keep the sliding prefetch from redoing it.
      for (let i = 0; i < queue.length; i++) this.prefetchedIndices.add(i);
      this.host.patch({ downloadStatus: 'done' });
    } catch {
      this.host.patch({ downloadStatus: 'idle' });
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Stop web-speech + hard-abort any in-flight utterance, then bump generation. */
  private abort(): number {
    this.wordAudio.stop();
    return ++this.generation;
  }

  /** Drain the current pipeline and create a fresh one subscribed to the runner. */
  private resetPipeline(): void {
    const old = this.subject$;
    this.subject$ = new Subject<TaggedSegment>();
    this.subscribeRunner(this.subject$);
    old.complete();
  }

  private emitCurrent(gen: number): void {
    const script = this.host.currentScript();
    const seg = this.host.currentSegment();
    if (script && seg) this.subject$.next({ segment: seg, generation: gen });
  }

  private subscribeRunner(subject$: Subject<TaggedSegment>): void {
    subject$
      .pipe(
        concatMap(({ segment, generation }: TaggedSegment) => {
          // Entry guard: generation already moved on before this slot even started.
          if (generation !== this.generation) {
            return from(Promise.resolve()).pipe(map(() => generation));
          }
          if (segment.type === 'silence') {
            return timer(segment.durationMs ?? SilenceDuration.AfterWord).pipe(map(() => generation));
          }
          // Read speed live so a mid-session change takes effect from the next segment.
          const rate = this.host.settings().speed;
          // Target language → HD-only pipeline (never Web Speech).
          if (segment.lang === 'de') {
            return from(this.wordAudio.playTarget(segment.text, 'de-DE', rate)).pipe(
              map(() => generation),
            );
          }
          // Native translation is shown on screen but NOT spoken — hold a silent
          // read-beat (scaled by text length and playback speed) so the learner has
          // time to read it before the sequence advances.
          return timer(this.nativeReadMs(segment.text, rate)).pipe(map(() => generation));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (gen: number) => {
          // Exit guard: this completion belongs to a superseded sequence (fires when
          // stop()/cancel() resolves a promise after a transport call bumped generation).
          if (gen !== this.generation) return;
          if (this.host.status() !== 'playing') return;

          const script = this.host.currentScript();
          const segIdx = this.host.segmentIndex();
          if (!script || segIdx >= script.segments.length) return;

          if (segIdx < script.segments.length - 1) {
            this.host.patch({ segmentIndex: segIdx + 1 });
            this.emitCurrent(gen);
          } else {
            const cardIdx = this.host.cardIndex();
            const queueLen = this.host.queue().length;
            if (cardIdx >= queueLen - 1) {
              if (this.host.settings().repeat) {
                this.host.patch({ cardIndex: 0, segmentIndex: 0, status: 'playing' });
                this.emitCurrent(gen);
              } else {
                this.host.patch({ status: 'complete' });
              }
            } else {
              this.host.patch({ cardIndex: cardIdx + 1, segmentIndex: 0 });
              this.host.saveSession();
              this.prefetchWindow(cardIdx + 1);
              this.emitCurrent(gen);
            }
          }
        },
        error: (err: unknown) => {
          this.host.patch({
            status: 'error',
            errorMessage: (err as Error)?.message ?? 'Audio failed',
          });
        },
      });
  }
}
