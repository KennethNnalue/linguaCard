import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'lc-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _isDark = signal(false);
  readonly isDark = this._isDark.asReadonly();

  initialize(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    const useDarkTheme =
      saved !== null
        ? saved === 'dark'
        : true;
    this.apply(useDarkTheme);
  }

  toggle(): void {
    this.apply(!this._isDark());
  }

  private apply(dark: boolean): void {
    this._isDark.set(dark);
    document.body.classList.toggle('ion-palette-dark', dark);
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }
}
