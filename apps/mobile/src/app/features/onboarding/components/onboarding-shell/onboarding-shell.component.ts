import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'lc-onboarding-shell',
  templateUrl: './onboarding-shell.component.html',
  styleUrls: ['./onboarding-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class OnboardingShellComponent {
  step = input.required<number>();
  total = input.required<number>();
  showBack = input(true);

  backClick = output<void>();
  skipClick = output<void>();

  get steps(): number[] {
    return Array.from({ length: this.total() }, (_, i) => i);
  }
}
