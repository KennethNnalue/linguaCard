import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

const SWIPE_THRESHOLD = 50;

@Component({
  selector: 'lc-onboarding-shell',
  templateUrl: './onboarding-shell.component.html',
  styleUrls: ['./onboarding-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd($event)',
  },
})
export class OnboardingShellComponent {
  step = input.required<number>();
  total = input.required<number>();
  showBack = input(true);

  backClick = output<void>();
  skipClick = output<void>();
  nextClick = output<void>();

  private touchStartX = 0;

  get steps(): number[] {
    return Array.from({ length: this.total() }, (_, i) => i);
  }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
  }

  onTouchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx > 0 && this.step() > 0) {
      this.backClick.emit();
    } else if (dx < 0) {
      this.nextClick.emit();
    }
  }
}
