import {Component, ElementRef, inject, signal, ViewChild} from '@angular/core';
import {Router} from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  arrowBackOutline,
  cameraOutline,
  cloudUploadOutline,
  closeOutline,
  documentOutline,
  downloadOutline,
} from 'ionicons/icons';
import {CsvParserService} from '../../../../shared/csv/csv-parser.service';
import {CategoryStore} from '../../store/category.store';
import {ImportStateService} from '../../services/import-state.service';

@Component({
  selector: 'lc-import',
  standalone: true,
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImportPage {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly csvService = inject(CsvParserService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly importState = inject(ImportStateService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);

  /** Set via componentProps when opened as a modal. */
  set isModal(v: boolean) { this._isModal.set(v ?? false); }
  readonly _isModal = signal(false);

  readonly dragActive = signal(false);

  constructor() {
    addIcons({arrowBackOutline, cameraOutline, cloudUploadOutline, closeOutline, documentOutline, downloadOutline});
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(): void {
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.processFile(file);
  }

  openFilePicker(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.processFile(file);
    input.value = '';
  }

  downloadTemplate(): void {
    fetch('/assets/linguacard-words.csv')
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'linguacard-words.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async navigateToImageImport(): Promise<void> {
    if (this._isModal()) {
      await this.modalCtrl.dismiss();
    }
    this.router.navigate(['/vault/import/image']);
  }

  async goBack(): Promise<void> {
    if (this._isModal()) {
      await this.modalCtrl.dismiss();
    } else {
      this.router.navigate(['/vault']);
    }
  }

  private processFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.showToast('Please select a .csv file');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const result = this.csvService.parse(text, file.name, this.categoryStore.categories());
      if (result.totalRows === 0) {
        this.showToast('No words found in this file');
        return;
      }
      this.importState.set(result);
      if (this._isModal()) await this.modalCtrl.dismiss();
      this.router.navigate(['/vault/import/review']);
    };
    reader.readAsText(file, 'UTF-8');
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      color: 'warning',
    });
    await toast.present();
  }
}
