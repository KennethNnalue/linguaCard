import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { OnboardingShellComponent } from '../../components/onboarding-shell/onboarding-shell.component';
import { OnboardingStore } from '../../store/onboarding.store';

@Component({
  selector: 'lc-welcome',
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe, OnboardingShellComponent],
})
export class WelcomePage {
  readonly store = inject(OnboardingStore);

  onGetStarted(): void {
    this.store.next();
  }

  onBack(): void {
    this.store.back();
  }

  onSkip(): void {
    this.store.skip();
  }
}
