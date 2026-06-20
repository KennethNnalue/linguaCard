import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { OnboardingShellComponent } from '../../components/onboarding-shell/onboarding-shell.component';
import { OnboardingStore } from '../../store/onboarding.store';

@Component({
  selector: 'lc-goal-finish',
  templateUrl: './goal-finish.page.html',
  styleUrls: ['./goal-finish.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe, OnboardingShellComponent],
})
export class GoalFinishPage {
  readonly store = inject(OnboardingStore);
  readonly dailyGoal = signal(this.store.suggestedGoal());
  readonly remindersEnabled = signal(false);

  increment(): void {
    this.dailyGoal.update(v => Math.min(v + 5, 100));
  }

  decrement(): void {
    this.dailyGoal.update(v => Math.max(v - 5, 5));
  }

  toggleReminders(): void {
    this.remindersEnabled.update(v => !v);
  }

  onFinish(): void {
    this.store.complete(this.dailyGoal(), this.remindersEnabled());
  }

  onBack(): void {
    this.store.back();
  }

  onSkip(): void {
    this.store.skip();
  }
}
