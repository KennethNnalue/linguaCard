import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, closeCircleOutline, documentOutline } from 'ionicons/icons';
import { ImagePickerComponent } from '../../../../../shared/image/image-picker/image-picker.component';
import { PickedImage } from '../../../../../shared/image/image.model';
import {
  ImageImportErrorCode,
  ImageImportStateService,
} from '../../image-import-state.service';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'lc-image-import',
  standalone: true,
  templateUrl: './image-import.page.html',
  styleUrls: ['./image-import.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ImagePickerComponent],
})
export class ImageImportPage {
  private readonly router = inject(Router);
  private readonly importImageState = inject(ImageImportStateService);
  private readonly toastCtrl = inject(ToastController);

  readonly error = this.importImageState.error;

  constructor() {
    addIcons({ arrowBackOutline, closeCircleOutline, documentOutline });
  }

  onImagePicked(image: PickedImage): void {
    if (image.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      this.importImageState.setError('too_large');
      return;
    }
    this.importImageState.setImage(image);
    this.router.navigate(['/vault/import/image/processing']);
  }

  async onPickError(msg: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 3000,
      position: 'bottom',
      color: 'warning',
    });
    await toast.present();
  }

  dismissError(): void {
    this.importImageState.clearError();
  }

  retryPick(): void {
    this.importImageState.clearError();
  }

  goToCsvImport(): void {
    this.importImageState.clear();
    this.router.navigate(['/vault/import']);
  }

  goBack(): void {
    this.router.navigate(['/vault/import']);
  }

  errorMessage(code: ImageImportErrorCode | null): string {
    switch (code) {
      case 'no_words':      return 'No German words found in this image';
      case 'blurry':        return 'Image is too blurry to read';
      case 'too_large':     return 'Image is too large (max 5MB)';
      case 'quota_exceeded': return 'AI quota reached for today';
      case 'ai_error':      return 'Something went wrong. Try again.';
      case 'network_error': return 'No internet connection';
      default:              return '';
    }
  }

  errorSuggestion(code: ImageImportErrorCode | null): string {
    switch (code) {
      case 'no_words':      return 'Try a clearer photo or switch to CSV import.';
      case 'blurry':        return 'Retake with better lighting.';
      case 'too_large':     return 'Use a smaller image.';
      case 'quota_exceeded': return 'The free AI quota is used up. Try again tomorrow or use CSV import.';
      case 'ai_error':      return 'Tap "Try again" to retry.';
      case 'network_error': return 'Check your connection.';
      default:              return '';
    }
  }
}
