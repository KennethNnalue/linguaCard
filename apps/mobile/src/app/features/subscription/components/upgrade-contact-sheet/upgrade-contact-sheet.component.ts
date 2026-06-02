import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { ContactApiService } from '../../services/contact-api.service';

@Component({
  selector: 'lc-upgrade-contact-sheet',
  templateUrl: './upgrade-contact-sheet.component.html',
  styleUrls: ['./upgrade-contact-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, ReactiveFormsModule, ButtonComponent],
})
export class UpgradeContactSheetComponent {
  private readonly modalCtrl  = inject(ModalController);
  private readonly contactApi = inject(ContactApiService);
  private readonly fb         = inject(FormBuilder);

  readonly isSubmitting = signal(false);
  readonly submitted    = signal(false);
  readonly error        = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    email:   ['', [Validators.required, Validators.email]],
    message: [''],
  });

  constructor() {
    addIcons({ closeOutline, checkmarkCircleOutline });
  }

  send(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.error.set(null);

    this.contactApi.sendUpgradeRequest(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitted.set(true);
        setTimeout(() => void this.modalCtrl.dismiss({ submitted: true }), 2500);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.error.set('Something went wrong. Please try again or email kennethnnalue.dev@gmail.com directly.');
      },
    });
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
