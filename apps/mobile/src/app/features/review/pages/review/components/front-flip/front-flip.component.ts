import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'lc-rv-front-flip',
  templateUrl: './front-flip.component.html',
  styleUrls: ['./front-flip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe],
})
export class FrontFlipComponent {
  readonly prompt = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly cue = input('review.session.whatIsGermanFor');
  readonly reveal = output<void>();

  constructor() {
    addIcons({ chevronDownOutline });
  }
}
