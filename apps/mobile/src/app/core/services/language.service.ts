import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageCode } from '@lingua-card/shared/domain';
import {
  DEFAULT_LANGUAGE,
  findSupportedLanguage,
  getLanguageDir,
} from '../i18n/supported-languages';

const STORAGE_KEY = 'lc-ui-language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly _current = signal<LanguageCode>(DEFAULT_LANGUAGE);
  readonly current = this._current.asReadonly();

  initialize(): void {
    const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    const resolved = saved && findSupportedLanguage(saved)
      ? saved
      : this.detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
    this.apply(resolved);
  }

  set(code: LanguageCode): void {
    localStorage.setItem(STORAGE_KEY, code);
    this.apply(code);
  }

  reconcileFromServer(serverLanguage: LanguageCode | undefined): void {
    if (!serverLanguage || !findSupportedLanguage(serverLanguage)) return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (!local) {
      this.set(serverLanguage);
    }
  }

  private apply(code: LanguageCode): void {
    this._current.set(code);
    this.translate.use(code);
    document.documentElement.lang = code;
    document.documentElement.dir = getLanguageDir(code);
  }

  private detectBrowserLanguage(): LanguageCode | null {
    const browserLang = navigator.language ?? navigator.languages?.[0];
    if (!browserLang) return null;
    const match = findSupportedLanguage(browserLang);
    return match?.code ?? null;
  }
}
