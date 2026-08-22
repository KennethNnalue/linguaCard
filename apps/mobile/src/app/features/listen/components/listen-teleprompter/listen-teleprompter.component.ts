import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SegmentViewModel } from '../../models/listen.models';

@Component({
  selector: 'lc-listen-teleprompter',
  templateUrl: './listen-teleprompter.component.html',
  styleUrl: './listen-teleprompter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.playing]': 'playing()' },
})
export class ListenTeleprompterComponent {
  readonly segments = input.required<readonly SegmentViewModel[]>();
  readonly playing = input(false);
}
