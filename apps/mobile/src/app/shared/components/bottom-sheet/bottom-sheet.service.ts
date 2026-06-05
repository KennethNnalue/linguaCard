import {inject, Injectable} from '@angular/core';
import {ModalController} from '@ionic/angular/standalone';
import {BottomSheetAction, BottomSheetComponent} from './bottom-sheet.component';

@Injectable({providedIn: 'root'})
export class BottomSheetService {
  private readonly modalCtrl = inject(ModalController);

  async open(title: string, actions: BottomSheetAction[]): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: BottomSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: false,
      componentProps: {titleProp: title, actionsProp: actions},
      cssClass: 'lc-bottom-sheet-modal',
    });
    await modal.present();
    await modal.onWillDismiss();
  }
}
