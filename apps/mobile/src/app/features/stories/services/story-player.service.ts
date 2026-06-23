import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Story } from '@lingua-card/shared/domain';
import { StoryStore } from '../store/story.store';
import { StoryApiService } from './story-api.service';
import { AiAudioCacheService } from '../../ai/audio/ai-audio-cache.service';
import { StoryAudioEngine } from './story-audio-engine.service';

export type RepeatMode = 'off' | 'all' | 'one';

/** Playback speeds offered in the story player. Default is 0.95× (slightly slowed
 *  for comprehension). Mirrors the Listen player's speed ladder. */
export type StoryPlaybackSpeed = 0.75 | 0.95 | 1 | 1.25 | 1.5;
export const STORY_PLAYBACK_SPEEDS: StoryPlaybackSpeed[] = [0.75, 0.95, 1, 1.25, 1.5];
export const DEFAULT_STORY_SPEED: StoryPlaybackSpeed = 0.95;

/**
 * Owns the cross-story audio queue for the Story Studio reader.
 *
 * Story Studio 2.0 behaviour (see design handoff):
 *  - Playback runs off a queue of stories. Opening a story sets the queue index.
 *  - Karaoke advances word-by-word using the story's real audio word-timestamps.
 *  - When audio ends, the next story in the queue autoplays (respecting
 *    shuffle / repeat). Completion is **manual only** — reaching the end never
 *    navigates to the Story Complete screen; the user taps "Mark story complete".
 *
 * Single-track playback (load / play / pause / karaoke timing) is delegated to a
 * private {@link StoryAudioEngine}; this service layers the queue, repeat, shuffle
 * and auto-advance on top. The reader page, mini-player and expanded player all
 * read from this single service so the player state survives tab switches and
 * story auto-advance.
 */
@Injectable({ providedIn: 'root' })
export class StoryPlayerService {
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);
  private readonly audioCache = inject(AiAudioCacheService);

  /** This service owns a dedicated engine instance (not shared with other readers). */
  private readonly engine = new StoryAudioEngine();

  // ── Queue ──────────────────────────────────────────────────────────────
  /** Ordered list of story ids that make up the playback queue. */
  readonly queue = signal<string[]>([]);
  readonly queueIdx = signal(0);

  /** The story currently loaded into the player (full data, audio resolved). */
  readonly current = signal<Story | null>(null);

  // ── Transport state (delegated to the engine) ────────────────────────────
  readonly playing = this.engine.playing;
  /** Index of the currently-spoken word across the whole story (-1 = not started). */
  readonly activeWordIdx = this.engine.activeWordIdx;
  readonly progressPct = this.engine.progressPct;
  readonly currentTimeMs = this.engine.currentTimeMs;
  readonly durationMs = this.engine.durationMs;

  readonly repeatMode = signal<RepeatMode>('off');
  readonly shuffle = signal(false);
  /** Current playback speed — persists across tracks and auto-advance. */
  readonly speed = signal<StoryPlaybackSpeed>(DEFAULT_STORY_SPEED);

  readonly hasNext = computed(() => this.queue().length > 1);

  /** Quiz result captured at manual completion — read by the Story Complete screen. */
  readonly lastQuizScore = signal<number | null>(null);
  readonly lastQuizTotal = signal<number>(0);

  /**
   * Bumped each time a track fails to load (404 / unsupported source) and the
   * player auto-skips past it. The reader page watches this to show a toast.
   * Carries the title of the skipped story (or null if none resolved).
   */
  readonly audioError = signal<{ seq: number; skippedTitle: string | null } | null>(null);
  private audioErrorSeq = 0;
  /** Guards the skip-on-error loop so an all-broken queue can't spin forever. */
  private consecutiveLoadFailures = 0;

  /** The next story in the queue after the current one (for "Play next"). */
  readonly nextStory = computed<Story | null>(() => {
    const q = this.queue();
    if (q.length === 0) return null;
    const nextId = q[(this.queueIdx() + 1) % q.length];
    return this.storyStore.getById(nextId);
  });

  constructor() {
    this.engine.setSpeed(this.speed());
    this.engine.onEnded(() => this.onEnded());
    this.engine.onError(() => this.onError());
    // A track that actually plays clears the broken-queue skip guard.
    this.engine.onPlayed(() => { this.consecutiveLoadFailures = 0; });
  }

  // ── Queue setup ──────────────────────────────────────────────────────────

  /**
   * Initialise the queue around a starting story. Builds the queue from the
   * user's stories (newest first); if the starting story isn't among them
   * (e.g. a platform story) it is prepended so it can still play.
   */
  initQueue(startId: string): void {
    const mine = this.storyStore.sortedStories().map(s => s.id);
    let q = mine.includes(startId) ? mine : [startId, ...mine];
    // De-dupe while preserving order.
    q = q.filter((id, i) => q.indexOf(id) === i);
    this.queue.set(q);
    this.queueIdx.set(Math.max(0, q.indexOf(startId)));
  }

  /** Attach the resolved story + audio for the active track. */
  setCurrent(story: Story, audioUrl: string): void {
    this.current.set(story);
    this.engine.load({
      url: audioUrl,
      timestamps: story.wordTimestamps,
      durationMs: story.audioDurationMs,
    });
  }

  // ── Transport ────────────────────────────────────────────────────────────

  togglePlay(): void {
    this.engine.togglePlay();
  }

  /**
   * Start playback and return the underlying play() promise so callers can detect
   * a blocked-autoplay rejection.
   */
  async play(): Promise<void> {
    await this.engine.play();
  }

  pause(): void {
    this.engine.pause();
  }

  restart(): void {
    this.engine.restart();
  }

  cycleRepeat(): void {
    this.repeatMode.update(m => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }

  toggleShuffle(): void {
    this.shuffle.update(v => !v);
  }

  /** Set an explicit playback speed and apply it to the live audio element. */
  setSpeed(speed: StoryPlaybackSpeed): void {
    this.speed.set(speed);
    this.engine.setSpeed(speed);
  }

  /** Advance to the next speed in the ladder (wraps around). */
  cycleSpeed(): void {
    const idx = STORY_PLAYBACK_SPEEDS.indexOf(this.speed());
    this.setSpeed(STORY_PLAYBACK_SPEEDS[(idx + 1) % STORY_PLAYBACK_SPEEDS.length]);
  }

  /** Skip to next track. If more than 5 words into a story, prev restarts it. */
  async next(keepPlaying = true): Promise<void> {
    const q = this.queue();
    if (q.length === 0) return;
    const idx = this.queueIdx();
    let nidx: number;
    if (this.shuffle() && q.length > 1) {
      do { nidx = Math.floor(Math.random() * q.length); } while (nidx === idx);
    } else {
      nidx = idx + 1;
    }
    if (nidx >= q.length) {
      if (this.repeatMode() === 'all') {
        nidx = 0;
      } else {
        // End of queue with repeat off — park on the final word, never complete.
        this.pause();
        const wordCount = this.current()?.wordTimestamps.length ?? 0;
        this.activeWordIdx.set(wordCount ? wordCount - 1 : -1);
        return;
      }
    }
    await this.loadIndex(nidx, keepPlaying);
  }

  async prev(): Promise<void> {
    if (this.activeWordIdx() > 4) {
      this.restart();
      return;
    }
    const q = this.queue();
    let nidx = this.queueIdx() - 1;
    if (nidx < 0) nidx = this.repeatMode() === 'all' ? q.length - 1 : 0;
    await this.loadIndex(nidx, this.playing());
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private onEnded(): void {
    if (this.repeatMode() === 'one') {
      this.engine.restart();
      void this.engine.play();
      return;
    }
    // Autoplay next — never navigate to completion.
    void this.next(true);
  }

  /**
   * The current track failed to load (404 / unsupported source). Flag the
   * story's audio as missing so it re-generates on next open, notify the page
   * (toast), then auto-skip to the next story. A consecutive-failure counter
   * bounded by the queue length stops the skip loop if every track is broken.
   */
  private onError(): void {
    const failed = this.current();
    if (failed) this.storyStore.markAudioMissing(failed.id);

    this.audioErrorSeq += 1;
    this.audioError.set({ seq: this.audioErrorSeq, skippedTitle: failed?.title ?? null });

    this.consecutiveLoadFailures += 1;
    // If we've failed once per queue item, the whole queue is unplayable — stop.
    if (this.consecutiveLoadFailures >= this.queue().length) {
      this.consecutiveLoadFailures = 0;
      this.engine.teardown();
      return;
    }
    // Skip to the next track and keep trying to play.
    void this.next(true);
  }

  /**
   * Load a queue item by index: fetch the story, resolve its audio, hand it to
   * the engine and (optionally) start playing. Returns the resolved story so the
   * reader page can render it.
   */
  async loadIndex(idx: number, keepPlaying: boolean): Promise<Story | null> {
    const id = this.queue()[idx];
    if (!id) return null;
    this.queueIdx.set(idx);

    let story = this.storyStore.getById(id);
    if (!story) {
      try { story = await firstValueFrom(this.api.getById(id)); }
      catch { return null; }
    }
    if (!story.audioUrl) {
      const updated = await this.storyStore.generateAudio(story.id);
      if (!updated) return null;
      story = updated;
    }
    const resolved = await this.audioCache.getOrDownload(story.id, story.audioUrl);
    const resolvedStory: Story = { ...story, audioUrl: resolved };

    // If audio failed to resolve, surface the story (so the UI updates) but don't
    // load a sourceless track — calling play() on one throws NotSupportedError.
    if (!resolved) {
      this.engine.teardown();
      this.current.set(resolvedStory);
      return resolvedStory;
    }

    this.setCurrent(resolvedStory, resolved);
    if (keepPlaying) {
      // Swallow play() rejection (blocked autoplay / unplayable source) — the
      // engine resets transport state and fires onError, so the player stays
      // usable for a subsequent user-gesture play.
      this.play().catch(() => undefined);
    }
    return resolvedStory;
  }

  /** Stop playback and release the audio element (call on reader leave). */
  teardown(): void {
    this.engine.teardown();
  }

  formatTime(ms: number): string {
    return this.engine.formatTime(ms);
  }
}
