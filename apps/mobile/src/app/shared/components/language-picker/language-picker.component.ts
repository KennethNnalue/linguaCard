import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LanguageCode } from '@lingua-card/shared/domain';
import { LanguageService } from '../../../core/services/language.service';
import { SUPPORTED_LANGUAGES } from '../../../core/i18n/supported-languages';

@Component({
  selector: 'lc-language-picker',
  templateUrl: './language-picker.component.html',
  styleUrls: ['./language-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguagePickerComponent {
  private readonly languageService = inject(LanguageService);
  readonly languages = SUPPORTED_LANGUAGES;
  readonly current = this.languageService.current;
  readonly open = signal(false);

  readonly currentLang = computed(() =>
    this.languages.find(l => l.code === this.current()) ?? this.languages[0]
  );

  toggle(): void {
    this.open.update(v => !v);
  }

  select(code: LanguageCode): void {
    this.languageService.set(code);
    this.open.set(false);
  }
}
