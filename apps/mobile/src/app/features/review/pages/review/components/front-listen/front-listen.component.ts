import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline, playOutline, refreshOutline, volumeHighOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'lc-rv-front-listen',
  templateUrl: './front-listen.component.html',
  styleUrls: ['./front-listen.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe],
})
export class FrontListenComponent {
  readonly isLoading = input(false);
  readonly play = output<void>();
  readonly replay = output<void>();
  readonly slow = output<void>();
  readonly reveal = output<void>();

  constructor() {
    addIcons({ chevronDownOutline, playOutline, refreshOutline, volumeHighOutline });
  }
}
