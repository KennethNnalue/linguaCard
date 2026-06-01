import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowBackOutline, checkmarkCircleOutline, mailOutline } from 'ionicons/icons';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'lc-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IonContent, IonHeader, IonToolbar, IonIcon, IonSpinner],
})
export class ForgotPasswordPage {
  private readonly authService = inject(AuthService);

  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly errorMessage = signal('');
  readonly sentEmail = signal('');

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  constructor() {
    addIcons({ arrowBackOutline, alertCircleOutline, mailOutline, checkmarkCircleOutline });
  }

  onSubmit(): void {
    if (this.form.invalid || this.loading()) return;
    this.errorMessage.set('');
    this.loading.set(true);

    const email = this.form.getRawValue().email!;
    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.sentEmail.set(email);
        this.sent.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.sent.set(true);
        this.sentEmail.set(email);
      },
    });
  }
}
