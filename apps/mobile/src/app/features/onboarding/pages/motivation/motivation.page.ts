import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import type { OnboardingMotivation } from '@lingua-card/shared/domain';
import { OnboardingShellComponent } from '../../components/onboarding-shell/onboarding-shell.component';
import { OnboardingStore } from '../../store/onboarding.store';

interface MotivationOption {
  value: OnboardingMotivation;
  emoji: string;
  labelKey: string;
}

const OPTIONS: MotivationOption[] = [
  { value: 'travel', emoji: '✈️', labelKey: 'onboarding.motivation.travel' },
  { value: 'work', emoji: '💼', labelKey: 'onboarding.motivation.work' },
  { value: 'family', emoji: '❤️', labelKey: 'onboarding.motivation.family' },
  { value: 'culture', emoji: '🎬', labelKey: 'onboarding.motivation.culture' },
  { value: 'exams', emoji: '🎓', labelKey: 'onboarding.motivation.exams' },
];

@Component({
  selector: 'lc-motivation',
  templateUrl: './motivation.page.html',
  styleUrls: ['./motivation.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe, OnboardingShellComponent],
})
export class MotivationPage {
  readonly store = inject(OnboardingStore);
  readonly options = OPTIONS;
  readonly selected = signal<OnboardingMotivation | null>(this.store.motivation());

  select(value: OnboardingMotivation): void {
    this.selected.set(value);
    this.store.setMotivation(value);
  }

  onNext(): void {
    this.store.next();
  }

  onBack(): void {
    this.store.back();
  }

  onSkip(): void {
    this.store.skip();
  }
}
