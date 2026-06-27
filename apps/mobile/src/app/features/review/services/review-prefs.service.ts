import { Injectable, signal } from '@angular/core';

/** The three Review study modes chosen on the hub. */
export type StudyMode = 'flip' | 'type' | 'audio';

/** Prompt direction for a session (custom study). */
export type StudyDirection = 'en-de' | 'de-en' | 'mixed';

const MODE_KEY = 'lc-review-mode';
const DIR_KEY = 'lc-review-dir';
const VALID_MODES: readonly StudyMode[] = ['flip', 'type', 'audio'];
const VALID_DIRS: readonly StudyDirection[] = ['en-de', 'de-en', 'mixed'];

/**
 * Holds the user's chosen study mode + prompt direction across the hub/custom →
 * session flow. Persisted to localStorage so choices are predictable across
 * launches (mirrors the ThemeService / LanguageService pattern).
 */
@Injectable({ providedIn: 'root' })
export class ReviewPrefsService {
  private readonly _mode = signal<StudyMode>(read(MODE_KEY, VALID_MODES, 'flip'));
  private readonly _dir = signal<StudyDirection>(read(DIR_KEY, VALID_DIRS, 'en-de'));

  readonly mode = this._mode.asReadonly();
  readonly dir = this._dir.asReadonly();

  setMode(mode: StudyMode): void {
    this._mode.set(mode);
    write(MODE_KEY, mode);
  }

  setDir(dir: StudyDirection): void {
    this._dir.set(dir);
    write(DIR_KEY, dir);
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
