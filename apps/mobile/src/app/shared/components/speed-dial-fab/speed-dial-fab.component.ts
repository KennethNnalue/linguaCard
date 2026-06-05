import {ChangeDetectionStrategy, Component, output, signal} from '@angular/core';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {addOutline, cloudUploadOutline, closeOutline, folderOpenOutline} from 'ionicons/icons';

@Component({
  selector: 'lc-speed-dial-fab',
  templateUrl: './speed-dial-fab.component.html',
  styleUrls: ['./speed-dial-fab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  host: {
    '[class.open]': 'isOpen()',
    '(document:click)': 'closeIfOpen()',
  },
})
export class SpeedDialFabComponent {
  readonly addCard = output<void>();
  readonly newCollection = output<void>();
  readonly import = output<void>();

  readonly isOpen = signal(false);
  readonly hoveredAction = signal<string | null>(null);

  constructor() {
    addIcons({addOutline, cloudUploadOutline, closeOutline, folderOpenOutline});
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update(v => !v);
  }

  onAction(event: MouseEvent, action: 'addCard' | 'newCollection' | 'import'): void {
    event.stopPropagation();
    this.isOpen.set(false);
    this.hoveredAction.set(null);
    this[action].emit();
  }

  setHovered(action: string | null): void {
    this.hoveredAction.set(action);
  }

  closeIfOpen(): void {
    if (this.isOpen()) this.isOpen.set(false);
  }
}
