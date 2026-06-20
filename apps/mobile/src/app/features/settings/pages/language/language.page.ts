import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageCode } from '@lingua-card/shared/domain';
import { LanguageService } from '../../../../core/services/language.service';
import { SettingsStore } from '../../store/settings.store';
import { SUPPORTED_LANGUAGES } from '../../../../core/i18n/supported-languages';

@Component({
  selector: 'lc-language',
  templateUrl: './language.page.html',
  styleUrl: './language.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, TranslatePipe],
})
export class LanguagePage {
  private readonly languageService = inject(LanguageService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);

  readonly languages = SUPPORTED_LANGUAGES;
  readonly currentLanguage = this.languageService.current;

  selectLanguage(code: LanguageCode): void {
    this.languageService.set(code);
    void this.settingsStore.update({ uiLanguage: code });
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
