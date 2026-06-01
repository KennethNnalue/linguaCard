import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, imagesOutline } from 'ionicons/icons';
import { PickedImage } from '../image.model';

// Capacitor Camera is lazily imported to support web fallback gracefully.
// On web, <input type="file"> is used instead.

@Component({
  selector: 'lc-image-picker',
  standalone: true,
  templateUrl: './image-picker.component.html',
  styleUrls: ['./image-picker.component.scss'],
  imports: [IonIcon],
})
export class ImagePickerComponent {
  @Output() imagePicked = new EventEmitter<PickedImage>();
  @Output() pickCancelled = new EventEmitter<void>();
  @Output() pickError = new EventEmitter<string>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private pendingSource: 'camera' | 'gallery' = 'gallery';

  constructor() {
    addIcons({ cameraOutline, imagesOutline });
  }

  async pickFromCamera(): Promise<void> {
    if (this.isCapacitorNative()) {
      await this.capacitorPick('camera');
    } else {
      this.pendingSource = 'camera';
      this.fileInputRef.nativeElement.capture = 'environment';
      this.fileInputRef.nativeElement.click();
    }
  }

  async pickFromGallery(): Promise<void> {
    if (this.isCapacitorNative()) {
      await this.capacitorPick('gallery');
    } else {
      this.pendingSource = 'gallery';
      this.fileInputRef.nativeElement.removeAttribute('capture');
      this.fileInputRef.nativeElement.click();
    }
  }

  onWebFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.pickCancelled.emit();
      input.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.pickError.emit('Unsupported image format. Please use JPEG, PNG, or WebP.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const img = new Image();
      img.onload = () => {
        this.imagePicked.emit({
          base64,
          mimeType: file.type as PickedImage['mimeType'],
          width: img.naturalWidth,
          height: img.naturalHeight,
          fileSizeBytes: file.size,
          source: this.pendingSource,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  private async capacitorPick(source: 'camera' | 'gallery'): Promise<void> {
    try {
      const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 85,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Base64,
      });

      if (!photo.base64String) {
        this.pickCancelled.emit();
        return;
      }

      // Derive file size approximation from base64 length
      const fileSizeBytes = Math.round((photo.base64String.length * 3) / 4);

      this.imagePicked.emit({
        base64: photo.base64String,
        mimeType: (photo.format === 'png' ? 'image/png' : 'image/jpeg') as PickedImage['mimeType'],
        width: 0,
        height: 0,
        fileSizeBytes,
        source,
      });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismiss')) {
        this.pickCancelled.emit();
      } else {
        this.pickError.emit('Camera permission denied or unavailable.');
      }
    }
  }

  private isCapacitorNative(): boolean {
    return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
      && ((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());
  }
}
