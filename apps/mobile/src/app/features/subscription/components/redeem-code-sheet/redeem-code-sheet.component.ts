import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, ModalController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkCircleOutline, giftOutline } from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { DiscountApiService } from '../../services/discount-api.service';
import { SubscriptionStore } from '../../store/subscription.store';

@Component({
  selector: 'lc-redeem-code-sheet',
  templateUrl: './redeem-code-sheet.component.html',
  styleUrls: ['./redeem-code-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, ReactiveFormsModule, ButtonComponent, TranslatePipe],
})
export class RedeemCodeSheetComponent {
  private readonly modalCtrl     = inject(ModalController);
  private readonly toastCtrl     = inject(ToastController);
  private readonly discountApi   = inject(DiscountApiService);
  private readonly subscription  = inject(SubscriptionStore);
  private readonly translate     = inject(TranslateService);
  private readonly fb            = inject(FormBuilder);
  private readonly destroyRef    = inject(DestroyRef);

  private dismissTimer?: ReturnType<typeof setTimeout>;

  readonly isSubmitting = signal(false);
  readonly activated    = signal(false);
  readonly error        = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor() {
    addIcons({ closeOutline, checkmarkCircleOutline, giftOutline });
    this.destroyRef.onDestroy(() => clearTimeout(this.dismissTimer));
  }

  redeem(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.error.set(null);

    const code = this.form.getRawValue().code.trim();

    this.discountApi.redeemCode({ code })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (result) => {
        this.isSubmitting.set(false);
        switch (result.status) {
          case 'activated':
            this.activated.set(true);
            this.subscription.loadStatus();
            this.dismissTimer = setTimeout(() => void this.modalCtrl.dismiss({ activated: true }), 2200);
            break;
          case 'partial':
            void this.openContactSheet(code, result.percentOff);
            break;
          case 'invalid':
          default:
            this.error.set(result.message ?? this.translate.instant('subscription.redeem.invalid'));
            break;
        }
      },
      error: () => {
        this.isSubmitting.set(false);
        this.error.set(this.translate.instant('subscription.redeem.error'));
      },
    });
  }

  private async openContactSheet(code: string, percentOff?: number): Promise<void> {
    const { UpgradeContactSheetComponent } = await import(
      '../upgrade-contact-sheet/upgrade-contact-sheet.component'
    );
    await this.modalCtrl.dismiss();
    const sheet = await this.modalCtrl.create({
      component: UpgradeContactSheetComponent,
      componentProps: { prefillCode: code, prefillPercentOff: percentOff ?? null },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await sheet.present();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
