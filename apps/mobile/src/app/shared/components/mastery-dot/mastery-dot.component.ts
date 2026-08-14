import { Component, ChangeDetectionStrategy, input } from '@angular/core';
type MasteryIndicator = 0 | 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'lc-mastery-dot',
  standalone: true,
  template: `<span class="dot" [class]="'dot--' + level()"></span>`,
  styleUrl: './mastery-dot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MasteryDotComponent {
  level = input<MasteryIndicator>(0);
}
