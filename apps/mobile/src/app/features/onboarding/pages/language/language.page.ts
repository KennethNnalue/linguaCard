import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { LanguageCode } from '@lingua-card/shared/domain';
import { LanguageService } from '../../../../core/services/language.service';
import { SUPPORTED_LANGUAGES } from '../../../../core/i18n/supported-languages';
import { OnboardingStore } from '../../store/onboarding.store';
import { SettingsStore } from '../../../settings/store/settings.store';

@Component({
  selector: 'lc-onboarding-language',
  templateUrl: './language.page.html',
  styleUrls: ['./language.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent],
})
export class LanguagePage {
  private readonly languageService = inject(LanguageService);
  private readonly settingsStore = inject(SettingsStore);
  readonly store = inject(OnboardingStore);
  readonly languages = SUPPORTED_LANGUAGES;
  readonly currentLanguage = this.languageService.current;

  select(code: LanguageCode): void {
    this.languageService.set(code);
  }

  onNext(): void {
    void this.settingsStore.update({ uiLanguage: this.languageService.current() });
    this.store.next();
  }
}
