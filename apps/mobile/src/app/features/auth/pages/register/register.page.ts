import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, eyeOffOutline, eyeOutline, logoGoogle } from 'ionicons/icons';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'lc-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IonContent, IonIcon, IonSpinner],
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly showPassword = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2)]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
  });

  constructor() {
    addIcons({ alertCircleOutline, logoGoogle, eyeOutline, eyeOffOutline });
  }

  onSubmit(): void {
    if (this.form.invalid || this.loading()) return;
    this.errorMessage.set('');
    this.loading.set(true);

    const { name, email, password } = this.form.getRawValue();
    this.authService
      .register({ name: name!, email: email!, password: password! })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigateByUrl('/home');
        },
        error: (err: Error) => {
          this.loading.set(false);
          this.errorMessage.set(err.message ?? 'Registration failed. Please try again.');
        },
      });
  }

  async signInWithGoogle(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'Google Sign-In coming soon',
      duration: 2000,
      position: 'bottom',
      color: 'medium',
    });
    await toast.present();
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }
}
