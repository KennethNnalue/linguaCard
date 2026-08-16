import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionCelebration } from '../../domain/engagement-domain';

@Component({
  selector: 'lc-session-celebration',
  templateUrl: './session-celebration.component.html',
  styleUrl: './session-celebration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class SessionCelebrationComponent {
  readonly celebration = input.required<SessionCelebration>();
  readonly animate = input(false);
}
