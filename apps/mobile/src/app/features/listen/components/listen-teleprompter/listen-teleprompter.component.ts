import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SegmentViewModel } from '../../models/listen.models';

/**
 * Three-row teleprompter: the last played line (faded), the current line
 * (boxed, with a pulsing dot while playing) and the first upcoming line.
 */
@Component({
  selector: 'lc-listen-teleprompter',
  templateUrl: './listen-teleprompter.component.html',
  styleUrl: './listen-teleprompter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.playing]': 'playing()' },
})
export class ListenTeleprompterComponent {
  readonly prev = input<SegmentViewModel | null>(null);
  readonly current = input<SegmentViewModel | null>(null);
  readonly next = input<SegmentViewModel | null>(null);
  readonly playing = input(false);
}
