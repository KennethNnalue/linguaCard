import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Decorative audio-equalizer bars.
 * - `variant="hero"`: 5 static bars (hub hero card).
 * - `variant="nav"`: 4 bars that animate only while `active` is true (player nav).
 */
@Component({
  selector: 'lc-listen-equalizer',
  templateUrl: './listen-equalizer.component.html',
  styleUrl: './listen-equalizer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.active]': 'active()',
    '[class.nav]': "variant() === 'nav'",
    '[class.hero]': "variant() === 'hero'",
    'aria-hidden': 'true',
  },
})
export class ListenEqualizerComponent {
  readonly active = input(false);
  readonly variant = input<'hero' | 'nav'>('nav');
}
