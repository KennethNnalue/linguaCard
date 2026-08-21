import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {IonIcon, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {chevronForwardOutline, closeOutline, createOutline, libraryOutline, starOutline} from 'ionicons/icons';

export interface BottomSheetAction {
  label: string;
  description?: string;
  icon?: string;
  role?: 'cancel' | 'destructive';
  handler?: () => void;
}

@Component({
  selector: 'lc-bottom-sheet',
  templateUrl: './bottom-sheet.component.html',
  styleUrls: ['./bottom-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class BottomSheetComponent {
  // Plain property setters so Ionic componentProps can write to them,
  // backed by signals so the template stays reactive.
  private readonly _title = signal('');
  private readonly _actions = signal<BottomSheetAction[]>([]);

  readonly title = this._title.asReadonly();
  readonly actions = this._actions.asReadonly();

  set titleProp(v: string) { this._title.set(v ?? ''); }
  set actionsProp(v: BottomSheetAction[]) { this._actions.set(v ?? []); }

  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({chevronForwardOutline, closeOutline, createOutline, libraryOutline, starOutline});
  }

  async select(action: BottomSheetAction): Promise<void> {
    if (action.role === 'cancel') {
      action.handler?.();
      await this.modalCtrl.dismiss(null, 'cancel');
      return;
    }
    action.handler?.();
    await this.modalCtrl.dismiss(action.label, 'selected');
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }
}
