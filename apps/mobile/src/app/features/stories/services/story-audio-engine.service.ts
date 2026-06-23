import { Injectable, signal } from '@angular/core';
import type { WordTimestamp } from '@lingua-card/shared/domain';

/** A single resolved track handed to the engine. */
export interface AudioTrack {
  url: string;
  timestamps: readonly WordTimestamp[];
  /** Fallback duration (ms) used until the element reports its own. */
  durationMs: number;
}

/**
 * Single-track audio engine for the story readers.
 *
 * Owns exactly one `HTMLAudioElement` and the karaoke word-index derivation off
 * its `timeupdate` events. It knows nothing about queues, stories or the DOM
 * beyond the audio element — the cross-story queue (`StoryPlayerService`) layers
 * on top of this, and the platform reader uses it directly for one track.
 *
 * Not `providedIn: 'root'`: each consumer provides its own instance so two
 * readers never fight over one audio element.
 */
@Injectable()
export class StoryAudioEngine {
  readonly playing = signal(false);
  /** Index of the currently-spoken word (-1 = not started / between words). */
  readonly activeWordIdx = signal(-1);
  readonly progressPct = signal(0);
  readonly currentTimeMs = signal(0);
  readonly durationMs = signal(0);

  private audio: HTMLAudioElement | null = null;
  private timeupdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;
  private errorHandler: (() => void) | null = null;
  private endedCallback: (() => void) | null = null;
  private errorCallback: (() => void) | null = null;
  private playedCallback: (() => void) | null = null;
  /** Set once a track has produced media data, so we can tell a real `ended`
   *  from an `ended` spuriously fired by a track that never loaded. */
  private hasPlayedData = false;
  private speed = 1;

  /** True once a usable track is loaded. */
  get hasTrack(): boolean {
    return !!this.audio?.src;
  }

  /** Load a track, replacing any current one. Resets transport state. */
  load(track: AudioTrack): void {
    this.teardown();
    const audio = new Audio(track.url);
    audio.playbackRate = this.speed;
    this.audio = audio;
    this.hasPlayedData = false;
    this.durationMs.set(track.durationMs || 0);

    const timestamps = track.timestamps;
    this.timeupdateHandler = () => {
      if (!this.hasPlayedData) {
        this.hasPlayedData = true;
        this.playedCallback?.();
      }
      const ms = audio.currentTime * 1000;
      const dur = audio.duration * 1000 || track.durationMs || 1;
      this.currentTimeMs.set(ms);
      this.durationMs.set(dur);
      this.progressPct.set(Math.min(100, (ms / dur) * 100));
      this.activeWordIdx.set(timestamps.findIndex(w => ms >= w.startMs && ms < w.endMs));
    };
    this.endedHandler = () => {
      this.playing.set(false);
      // Guard: a track that errored before producing any data can also fire
      // `ended` — treat that as a failure, not a natural finish, so the queue
      // doesn't auto-advance off a broken track twice.
      if (!this.hasPlayedData) {
        this.errorCallback?.();
        return;
      }
      this.endedCallback?.();
    };
    this.errorHandler = () => {
      // MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) — most often a 404 / missing audio
      // file. Surface to the player so it can skip + flag the story for regen.
      this.playing.set(false);
      this.errorCallback?.();
    };
    audio.addEventListener('timeupdate', this.timeupdateHandler);
    audio.addEventListener('ended', this.endedHandler);
    audio.addEventListener('error', this.errorHandler);
  }

  /** Register a callback invoked when the current track ends (after `playing` is cleared). */
  onEnded(cb: (() => void) | null): void {
    this.endedCallback = cb;
  }

  /** Register a callback invoked when the current track fails to load/play. */
  onError(cb: (() => void) | null): void {
    this.errorCallback = cb;
  }

  /** Register a callback invoked once a track starts producing playback data. */
  onPlayed(cb: (() => void) | null): void {
    this.playedCallback = cb;
  }

  /**
   * Start playback. Restarts from the top if parked at the end. Returns the
   * underlying play() promise so callers can detect blocked-autoplay rejection.
   * No-ops cleanly on a sourceless element (resolve failed / nothing loaded).
   */
  async play(): Promise<void> {
    const audio = this.audio;
    if (!audio || !audio.src) {
      this.playing.set(false);
      return;
    }
    if (audio.ended || audio.currentTime >= (audio.duration || Infinity)) {
      audio.currentTime = 0;
      this.activeWordIdx.set(-1);
    }
    try {
      await audio.play();
    } catch (err) {
      // Blocked autoplay or unplayable source — leave the element intact but
      // reset transport state so a later user-gesture play() can retry cleanly.
      this.playing.set(false);
      throw err;
    }
    this.playing.set(true);
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.playing.set(false);
    }
  }

  /**
   * Toggle play/pause. Swallows play() rejections (blocked autoplay / load
   * failure) so they don't surface as uncaught promise errors.
   */
  togglePlay(): void {
    if (!this.audio) return;
    if (this.playing()) {
      this.pause();
    } else {
      this.play().catch(() => this.playing.set(false));
    }
  }

  /** Jump back to the start, keeping playback running if it was. */
  restart(): void {
    if (!this.audio) return;
    this.audio.currentTime = 0;
    this.activeWordIdx.set(-1);
    this.progressPct.set(0);
    if (this.playing()) void this.audio.play();
  }

  /** Set playback speed; persists across track changes. */
  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.audio) this.audio.playbackRate = speed;
  }

  /** Release the audio element and its listeners. */
  teardown(): void {
    if (this.audio) {
      if (this.timeupdateHandler) this.audio.removeEventListener('timeupdate', this.timeupdateHandler);
      if (this.endedHandler) this.audio.removeEventListener('ended', this.endedHandler);
      if (this.errorHandler) this.audio.removeEventListener('error', this.errorHandler);
      this.audio.pause();
    }
    this.audio = null;
    this.timeupdateHandler = null;
    this.endedHandler = null;
    this.errorHandler = null;
    this.hasPlayedData = false;
    this.playing.set(false);
    this.activeWordIdx.set(-1);
  }

  formatTime(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
