import {Injectable, signal} from '@angular/core';
import type { RequestedPromptDirection, ReviewMode } from '../domain/review-domain';
import type { ReviewAutoplayMode } from '../application/review-audio-policy';

export type StudyMode = 'flip' | 'type';

/** Prompt direction for a session (custom study). */
export type StudyDirection = 'en-de' | 'de-en' | 'mixed';

export function toReviewMode(mode: StudyMode): ReviewMode {
  return mode === 'type' ? 'typing' : 'recall';
}

export function toPromptDirection(direction: StudyDirection): RequestedPromptDirection {
  if (direction === 'de-en') return 'target_to_source';
  if (direction === 'mixed') return 'mixed';
  return 'source_to_target';
}

const MODE_KEY = 'lc-review-mode';
const DIR_KEY = 'lc-review-dir';
const AUTOPLAY_KEY = 'lc-review-autoplay';
const VALID_MODES: readonly StudyMode[] = ['flip', 'type'];
const VALID_DIRS: readonly StudyDirection[] = ['en-de', 'de-en', 'mixed'];
const VALID_AUTOPLAY: readonly ReviewAutoplayMode[] = ['off', 'answer', 'answer_and_example'];

/**
 * Holds the user's chosen study mode + prompt direction across the hub/custom →
 * session flow. Persisted to localStorage so choices are predictable across
 * launches (mirrors the ThemeService / LanguageService pattern).
 */
@Injectable({providedIn: 'root'})
export class ReviewPrefsService {
  private readonly _mode = signal<StudyMode>(read(MODE_KEY, VALID_MODES, 'type'));
  private readonly _dir = signal<StudyDirection>(read(DIR_KEY, VALID_DIRS, 'en-de'));
  private readonly _autoplay = signal<ReviewAutoplayMode>(read(AUTOPLAY_KEY, VALID_AUTOPLAY, 'off'));

  readonly mode = this._mode.asReadonly();
  readonly dir = this._dir.asReadonly();
  readonly autoplay = this._autoplay.asReadonly();

  setMode(mode: StudyMode): void {
    this._mode.set(mode);
    write(MODE_KEY, mode);
  }

  setDir(dir: StudyDirection): void {
    this._dir.set(dir);
    write(DIR_KEY, dir);
  }

  setAutoplay(mode: ReviewAutoplayMode): void {
    this._autoplay.set(mode);
    write(AUTOPLAY_KEY, mode);
  }
}

function read<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && valid.includes(stored)) return stored;
  } catch {
    // ignore
  }
  return fallback;
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode / quota)
  }
}
