import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayMode } from '@lingua-card/shared/domain';
import { PlayModeOption } from '../../models/listen.models';

/**
 * Playlist-mode selector.
 * - `variant="grid"`: icon cards with title + description (hub).
 * - `variant="tabs"`: compact pill tabs (player).
 */
@Component({
  selector: 'lc-listen-mode-selector',
  templateUrl: './listen-mode-selector.component.html',
  styleUrl: './listen-mode-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    '[class.grid]': "variant() === 'grid'",
    '[class.tabs]': "variant() === 'tabs'",
    role: 'group',
  },
})
export class ListenModeSelectorComponent {
  readonly modes = input.required<readonly PlayModeOption[]>();
  readonly active = input.required<PlayMode>();
  readonly variant = input<'grid' | 'tabs'>('grid');
  readonly modeChange = output<PlayMode>();
}
