import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlaybackSpeed } from '../../models/listen.models';

/** "SPEED" label + selectable playback-speed chip row. Shared by hub and player. */
@Component({
  selector: 'lc-listen-speed-chips',
  templateUrl: './listen-speed-chips.component.html',
  styleUrl: './listen-speed-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class ListenSpeedChipsComponent {
  readonly speeds = input.required<readonly PlaybackSpeed[]>();
  readonly active = input.required<PlaybackSpeed>();
  readonly speedChange = output<PlaybackSpeed>();
}
