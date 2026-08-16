import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DailyGoalReachedFeedback } from '../../domain/engagement-domain';

const AUTO_DISMISS_MS = 3_200;

@Component({
  selector: 'lc-daily-goal-feedback',
  templateUrl: './daily-goal-feedback.component.html',
  styleUrl: './daily-goal-feedback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class DailyGoalFeedbackComponent implements OnInit, OnDestroy {
  readonly feedback = input.required<DailyGoalReachedFeedback>();
  readonly dismissed = output<string>();
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.dismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
  }

  ngOnDestroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }

  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.dismissed.emit(this.feedback().feedbackId);
  }
}
