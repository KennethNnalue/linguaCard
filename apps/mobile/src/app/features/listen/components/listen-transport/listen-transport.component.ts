import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Player transport row: shuffle · previous · play/pause · next · repeat. */
@Component({
  selector: 'lc-listen-transport',
  templateUrl: './listen-transport.component.html',
  styleUrl: './listen-transport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class ListenTransportComponent {
  readonly playing = input(false);
  readonly error = input(false);
  readonly shuffled = input(false);
  readonly repeat = input(false);

  readonly togglePlay = output<void>();
  readonly next = output<void>();
  readonly previous = output<void>();
  readonly toggleShuffle = output<void>();
  readonly toggleRepeat = output<void>();
}
