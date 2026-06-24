import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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

  /**
   * Resolve the startup language and **await** its bundle before the app paints.
   * Run from an app initializer (not a component) so the translation store is
   * populated before any `| translate` pipe renders. Previously this happened in
   * AppComponent.ngOnInit, which fired after the first page had already rendered:
   * on production (network latency, no instant local JSON) some pipes hit the
   * MissingTranslationHandler and "stuck" on the raw key, while locally the JSON
   * loaded fast enough to mask the race.
   */
  async initialize(): Promise<void> {
    const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    const resolved = saved && findSupportedLanguage(saved)
      ? saved
      : this.detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
    await this.apply(resolved);
  }

  set(code: LanguageCode): void {
    localStorage.setItem(STORAGE_KEY, code);
    void this.apply(code);
  }

  reconcileFromServer(serverLanguage: LanguageCode | undefined): void {
    if (!serverLanguage || !findSupportedLanguage(serverLanguage)) return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (!local) {
      this.set(serverLanguage);
    }
  }

  private async apply(code: LanguageCode): Promise<void> {
    this._current.set(code);
    document.documentElement.lang = code;
    document.documentElement.dir = getLanguageDir(code);
    // `use()` returns an observable that completes once the bundle is loaded.
    // Awaiting it lets the app initializer block first paint until translations
    // are in the store. Swallow load errors so a network blip never hard-blocks
    // boot — pipes will fall back to keys, same as before.
    try {
      await firstValueFrom(this.translate.use(code));
    } catch {
      /* bundle failed to load — proceed; translations resolve on retry */
    }
  }

  private detectBrowserLanguage(): LanguageCode | null {
    const browserLang = navigator.language ?? navigator.languages?.[0];
    if (!browserLang) return null;
    const match = findSupportedLanguage(browserLang);
    return match?.code ?? null;
  }
}
