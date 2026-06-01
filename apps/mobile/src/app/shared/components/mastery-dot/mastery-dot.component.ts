import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { MasteryLevel } from '../../../core/models/mock-data';

@Component({
  selector: 'lc-mastery-dot',
  standalone: true,
  template: `<span class="dot" [class]="'dot--' + level()"></span>`,
  styleUrl: './mastery-dot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MasteryDotComponent {
  level = input<MasteryLevel>(0);
}
