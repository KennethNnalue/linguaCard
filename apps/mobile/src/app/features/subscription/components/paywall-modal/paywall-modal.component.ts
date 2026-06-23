import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

@Component({
  selector: 'lc-paywall-modal',
  templateUrl: './paywall-modal.component.html',
  styleUrls: ['./paywall-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonIcon, ButtonComponent, TranslatePipe],
})
export class PaywallModalComponent {
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ sparklesOutline, checkmarkCircleOutline });
  }

  async openContactSheet(): Promise<void> {
    const { UpgradeContactSheetComponent } = await import(
      '../upgrade-contact-sheet/upgrade-contact-sheet.component'
    );
    await this.modalCtrl.dismiss();
    const sheet = await this.modalCtrl.create({
      component: UpgradeContactSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await sheet.present();
  }

  async openRedeemSheet(): Promise<void> {
    const { RedeemCodeSheetComponent } = await import(
      '../redeem-code-sheet/redeem-code-sheet.component'
    );
    await this.modalCtrl.dismiss();
    const sheet = await this.modalCtrl.create({
      component: RedeemCodeSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await sheet.present();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
