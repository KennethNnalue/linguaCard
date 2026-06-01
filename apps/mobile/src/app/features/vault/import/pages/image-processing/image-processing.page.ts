import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  ToastController,
} from '@ionic/angular/standalone';
import { ImageImportApiService } from '../../services/image-import-api.service';
import { ImageImportStateService } from '../../image-import-state.service';
import { PickedImage } from '../../../../../shared/image/image.model';

const STATUS_COPY = [
  'Scanning your image…',
  'Spotting vocabulary…',
  'Generating examples…',
] as const;

@Component({
  selector: 'app-image-processing',
  standalone: true,
  templateUrl: './image-processing.page.html',
  styleUrls: ['./image-processing.page.scss'],
  imports: [IonContent],
})
export class ImageProcessingPage implements OnInit, OnDestroy {
  private readonly importImageState = inject(ImageImportStateService);
  private readonly imageImportApi = inject(ImageImportApiService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly image = this.importImageState.image;
  readonly statusPhase = signal<0 | 1 | 2>(0);
  readonly statusCopy = STATUS_COPY;

  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    if (!this.image()) {
      this.router.navigate(['/vault/import/image']);
      return;
    }
    this.startStatusCycling();
    this.callApi(this.image()!);
  }

  private startStatusCycling(): void {
    this.timers.push(setTimeout(() => this.statusPhase.set(1), 2000));
    this.timers.push(setTimeout(() => this.statusPhase.set(2), 4500));
  }

  private callApi(image: PickedImage): void {
    this.imageImportApi.extractWords(image).subscribe({
      next: (result) => {
        this.importImageState.setResult(result);
        this.router.navigate(['/vault/import/image/review']);
      },
      error: async (err) => {
        const status: number = err?.status ?? 0;
        const errorCode = this.toErrorCode(status);
        this.importImageState.setError(errorCode);

        const message = err?.error?.message ?? 'Something went wrong. Please try again.';
        const toast = await this.toastCtrl.create({
          message,
          duration: 3500,
          position: 'bottom',
          color: 'danger',
        });
        await toast.present();
        this.router.navigate(['/vault/import/image']);
      },
    });
  }

  cancel(): void {
    this.importImageState.clear();
    this.router.navigate(['/vault/import/image']);
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  private toErrorCode(status: number): Parameters<ImageImportStateService['setError']>[0] {
    if (status === 400) return 'no_words';
    if (status === 422) return 'blurry';
    if (status === 413) return 'too_large';
    if (status === 429) return 'quota_exceeded';
    if (status === 0)   return 'network_error';
    return 'ai_error';
  }
}
