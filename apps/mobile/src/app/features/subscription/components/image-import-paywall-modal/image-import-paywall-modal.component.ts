import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, checkmarkCircleOutline, imageOutline } from 'ionicons/icons';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

@Component({
  selector: 'lc-image-import-paywall-modal',
  templateUrl: './image-import-paywall-modal.component.html',
  styleUrls: ['./image-import-paywall-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonIcon, ButtonComponent],
})
export class ImageImportPaywallModalComponent {
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ sparklesOutline, checkmarkCircleOutline, imageOutline });
  }

  async openContactSheet(): Promise<void> {
    const { UpgradeContactSheetComponent } = await import(
      '../upgrade-contact-sheet/upgrade-contact-sheet.component'
    );
    await this.modalCtrl.dismiss({ proceed: false });
    const sheet = await this.modalCtrl.create({
      component: UpgradeContactSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await sheet.present();
  }

  proceedFree(): void {
    void this.modalCtrl.dismiss({ proceed: true });
  }

  dismiss(): void {
    void this.modalCtrl.dismiss({ proceed: false });
  }
}
